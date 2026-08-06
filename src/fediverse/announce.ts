import type { Post } from '../models/post.js';
import { deliverToFollowers } from './delivery.js';
import {
  buildCreateActivity,
  buildDeleteActivity,
  buildUpdateActivity,
} from './objects.js';
import { isFediverseEnabled, resolvePublicBaseUrl } from './runtime.js';

/** Minimal post shape needed for ActivityPub announcements. */
export type AnnouncablePost = {
  getAttribute: Post['getAttribute'];
  toJSON: Post['toJSON'];
};

function isCurrentlyPublished(post: AnnouncablePost): boolean {
  const publishedAt = post.getAttribute('published_at');
  if (!publishedAt) {
    return false;
  }
  return new Date(publishedAt as string).getTime() <= Date.now();
}

function publicBaseUrlOrNull(): string | null {
  try {
    return resolvePublicBaseUrl();
  } catch {
    return null;
  }
}

/**
 * Announce a newly published post (or a create that included published_at).
 */
export async function announceCreate(post: AnnouncablePost): Promise<void> {
  if (!isFediverseEnabled() || !isCurrentlyPublished(post)) {
    return;
  }
  const baseUrl = publicBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }
  await deliverToFollowers(
    buildCreateActivity(baseUrl, post as Post),
    baseUrl,
  );
}

/**
 * Announce an update to an already-published post.
 */
export async function announceUpdate(post: AnnouncablePost): Promise<void> {
  if (!isFediverseEnabled() || !isCurrentlyPublished(post)) {
    return;
  }
  const baseUrl = publicBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }
  await deliverToFollowers(
    buildUpdateActivity(baseUrl, post as Post),
    baseUrl,
  );
}

/**
 * Announce deletion / unpublish of a post that was previously public.
 */
export async function announceDelete(
  postId: number | string,
  wasPublished: boolean,
): Promise<void> {
  if (!isFediverseEnabled() || !wasPublished) {
    return;
  }
  const baseUrl = publicBaseUrlOrNull();
  if (!baseUrl) {
    return;
  }
  await deliverToFollowers(buildDeleteActivity(baseUrl, postId), baseUrl);
}
