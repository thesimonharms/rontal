import type { PondoknusaRequest } from '@pondoknusa/http';
import { Response } from '@pondoknusa/http';
import { deliverToInbox } from '../fediverse/delivery.js';
import { verifyRequestSignature } from '../fediverse/http-signature.js';
import { ensureActorKeyPair } from '../fediverse/keys.js';
import {
  actorId,
  buildAcceptFollow,
  buildArticleObject,
  buildCreateActivity,
  buildFollowersCollection,
  buildOutboxCollection,
  buildActorDocument,
} from '../fediverse/objects.js';
import { fetchRemoteActor } from '../fediverse/remote.js';
import { activityJson, accepted } from '../fediverse/response.js';
import {
  isFediverseEnabled,
  resolvePublicBaseUrl,
} from '../fediverse/runtime.js';
import { FediverseFollower } from '../models/fediverse-follower.js';
import { Post } from '../models/post.js';

function notFound() {
  return Response.json({ message: 'Not Found' }, { status: 404 });
}

function resolveBase(request: PondoknusaRequest): string | null {
  try {
    return resolvePublicBaseUrl(request.url.origin);
  } catch {
    return null;
  }
}

export class ActivityPubController {
  /**
   * GET /ap/actor
   */
  async actor(request: PondoknusaRequest) {
    if (!isFediverseEnabled()) {
      return notFound();
    }

    const baseUrl = resolveBase(request);
    if (!baseUrl) {
      return Response.json(
        { message: 'Fediverse public_base_url is not configured' },
        { status: 503 },
      );
    }

    const keys = await ensureActorKeyPair();
    const followerCount = await FediverseFollower.query().count();
    return activityJson(
      buildActorDocument(baseUrl, keys.publicKeyPem, followerCount),
    );
  }

  /**
   * GET /ap/actor/outbox
   */
  async outbox(request: PondoknusaRequest) {
    if (!isFediverseEnabled()) {
      return notFound();
    }

    const baseUrl = resolveBase(request);
    if (!baseUrl) {
      return Response.json(
        { message: 'Fediverse public_base_url is not configured' },
        { status: 503 },
      );
    }

    const posts = (await Post.scope('published')
      .orderBy('published_at', 'desc')
      .getModels()) as Post[];

    const activities = posts.map((post) => buildCreateActivity(baseUrl, post));
    return activityJson(buildOutboxCollection(baseUrl, activities));
  }

  /**
   * GET /ap/actor/followers
   */
  async followers(request: PondoknusaRequest) {
    if (!isFediverseEnabled()) {
      return notFound();
    }

    const baseUrl = resolveBase(request);
    if (!baseUrl) {
      return Response.json(
        { message: 'Fediverse public_base_url is not configured' },
        { status: 503 },
      );
    }

    const totalItems = await FediverseFollower.query().count();
    return activityJson(buildFollowersCollection(baseUrl, totalItems));
  }

  /**
   * GET /ap/posts/:id
   */
  async showPost(request: PondoknusaRequest) {
    if (!isFediverseEnabled()) {
      return notFound();
    }

    const baseUrl = resolveBase(request);
    if (!baseUrl) {
      return Response.json(
        { message: 'Fediverse public_base_url is not configured' },
        { status: 503 },
      );
    }

    const id = request.param('id');
    const post = (await Post.scope('published')
      .where('id', id!)
      .firstModel()) as Post | null;
    if (!post) {
      return notFound();
    }

    return activityJson(buildArticleObject(baseUrl, post));
  }

  /**
   * POST /ap/actor/inbox — accept Follow / Undo(Follow).
   */
  async inbox(request: PondoknusaRequest) {
    if (!isFediverseEnabled()) {
      return notFound();
    }

    const baseUrl = resolveBase(request);
    if (!baseUrl) {
      return Response.json(
        { message: 'Fediverse public_base_url is not configured' },
        { status: 503 },
      );
    }

    const rawBody = await request.text();
    let activity: Record<string, unknown>;
    try {
      activity = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return Response.json({ message: 'Invalid JSON' }, { status: 400 });
    }

    const actorRef =
      typeof activity.actor === 'string'
        ? activity.actor
        : activity.actor &&
            typeof activity.actor === 'object' &&
            typeof (activity.actor as Record<string, unknown>).id === 'string'
          ? ((activity.actor as Record<string, unknown>).id as string)
          : null;

    if (!actorRef) {
      return Response.json({ message: 'Missing actor' }, { status: 400 });
    }

    const remote = await fetchRemoteActor(actorRef);
    if (!remote) {
      return Response.json(
        { message: 'Unable to resolve actor' },
        { status: 400 },
      );
    }

    const signature = request.header('signature');
    if (!signature || !remote.publicKeyPem) {
      return Response.json(
        { message: 'HTTP Signature required' },
        { status: 401 },
      );
    }

    const path = `${request.url.pathname}${request.url.search}`;
    const valid = verifyRequestSignature({
      publicKeyPem: remote.publicKeyPem,
      signatureHeader: signature,
      method: request.method,
      path,
      headers: request.headers,
      body: rawBody,
    });

    if (!valid) {
      return Response.json(
        { message: 'Invalid HTTP Signature' },
        { status: 401 },
      );
    }

    const type = activity.type;
    if (type === 'Follow') {
      return this.handleFollow(baseUrl, activity, remote);
    }

    if (type === 'Undo') {
      return this.handleUndo(activity, remote);
    }

    // One-way publisher: ignore likes, replies, etc.
    return accepted();
  }

  private async handleFollow(
    baseUrl: string,
    activity: Record<string, unknown>,
    remote: { id: string; inbox: string; sharedInbox: string | null },
  ) {
    const objectRef =
      typeof activity.object === 'string'
        ? activity.object
        : activity.object &&
            typeof activity.object === 'object' &&
            typeof (activity.object as Record<string, unknown>).id === 'string'
          ? ((activity.object as Record<string, unknown>).id as string)
          : null;

    if (objectRef !== actorId(baseUrl)) {
      return Response.json(
        { message: 'Follow target mismatch' },
        { status: 400 },
      );
    }

    const existing = await FediverseFollower.where(
      'actor_id',
      remote.id,
    ).firstModel();
    const now = new Date().toISOString();

    if (existing) {
      await existing.update({
        inbox_url: remote.inbox,
        shared_inbox_url: remote.sharedInbox,
        updated_at: now,
      });
    } else {
      await FediverseFollower.create({
        actor_id: remote.id,
        inbox_url: remote.inbox,
        shared_inbox_url: remote.sharedInbox,
        created_at: now,
        updated_at: now,
      });
    }

    // Ensure our key exists before signing Accept.
    await ensureActorKeyPair();
    const accept = buildAcceptFollow(baseUrl, activity);
    try {
      await deliverToInbox(remote.inbox, accept, baseUrl);
    } catch {
      // Best-effort Accept delivery; follower is already stored.
    }

    return accepted();
  }

  private async handleUndo(
    activity: Record<string, unknown>,
    remote: { id: string },
  ) {
    const object = activity.object;
    let isFollowUndo = false;

    if (typeof object === 'string') {
      // Undo of an activity URL — treat as unfollow of this actor pair.
      isFollowUndo = true;
    } else if (object && typeof object === 'object') {
      const obj = object as Record<string, unknown>;
      isFollowUndo = obj.type === 'Follow';
    }

    if (!isFollowUndo) {
      return accepted();
    }

    const follower = await FediverseFollower.where(
      'actor_id',
      remote.id,
    ).firstModel();
    if (follower) {
      await follower.delete();
    }

    return accepted();
  }
}
