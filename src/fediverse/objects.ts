import type { Post } from '../models/post.js';
import {
  actorDisplayName,
  actorSummary,
  actorUsername,
  postPermalink,
} from './runtime.js';

export const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
export const AS_CONTEXT = 'https://www.w3.org/ns/activitystreams';

export function actorId(baseUrl: string): string {
  return `${baseUrl}/ap/actor`;
}

export function actorInboxUrl(baseUrl: string): string {
  return `${baseUrl}/ap/actor/inbox`;
}

export function actorOutboxUrl(baseUrl: string): string {
  return `${baseUrl}/ap/actor/outbox`;
}

export function actorFollowersUrl(baseUrl: string): string {
  return `${baseUrl}/ap/actor/followers`;
}

export function actorKeyId(baseUrl: string): string {
  return `${actorId(baseUrl)}#main-key`;
}

export function articleId(baseUrl: string, postId: number | string): string {
  return `${baseUrl}/ap/posts/${postId}`;
}

export function activityId(
  baseUrl: string,
  postId: number | string,
  kind: 'create' | 'update' | 'delete',
): string {
  return `${articleId(baseUrl, postId)}#${kind}`;
}

export function buildActorDocument(
  baseUrl: string,
  publicKeyPem: string,
  followerCount = 0,
): Record<string, unknown> {
  const id = actorId(baseUrl);
  return {
    '@context': [
      AS_CONTEXT,
      'https://w3id.org/security/v1',
    ],
    id,
    type: 'Service',
    preferredUsername: actorUsername(),
    name: actorDisplayName(),
    summary: actorSummary(),
    inbox: actorInboxUrl(baseUrl),
    outbox: actorOutboxUrl(baseUrl),
    followers: actorFollowersUrl(baseUrl),
    url: baseUrl,
    manuallyApprovesFollowers: false,
    publicKey: {
      id: actorKeyId(baseUrl),
      owner: id,
      publicKeyPem,
    },
    followersCount: followerCount,
  };
}

export function buildArticleObject(
  baseUrl: string,
  post: Post,
): Record<string, unknown> {
  const json = post.toJSON();
  const id = articleId(baseUrl, json.id as number);
  const slug = json.slug as string;
  const permalink = postPermalink(slug, baseUrl);
  const published = json.published_at
    ? new Date(json.published_at as string).toISOString()
    : undefined;
  const updated = json.updated_at
    ? new Date(json.updated_at as string).toISOString()
    : undefined;

  const object: Record<string, unknown> = {
    '@context': AS_CONTEXT,
    id,
    type: 'Article',
    attributedTo: actorId(baseUrl),
    name: json.title,
    summary: json.excerpt ?? undefined,
    content: json.rendered_body ?? '',
    published,
    updated,
    to: [AS_PUBLIC],
    cc: [actorFollowersUrl(baseUrl)],
  };

  if (permalink) {
    object.url = permalink;
  }

  return object;
}

export function buildCreateActivity(
  baseUrl: string,
  post: Post,
): Record<string, unknown> {
  const article = buildArticleObject(baseUrl, post);
  const json = post.toJSON();
  return {
    '@context': AS_CONTEXT,
    id: activityId(baseUrl, json.id as number, 'create'),
    type: 'Create',
    actor: actorId(baseUrl),
    published: article.published,
    to: [AS_PUBLIC],
    cc: [actorFollowersUrl(baseUrl)],
    object: article,
  };
}

export function buildUpdateActivity(
  baseUrl: string,
  post: Post,
): Record<string, unknown> {
  const article = buildArticleObject(baseUrl, post);
  const json = post.toJSON();
  return {
    '@context': AS_CONTEXT,
    id: activityId(baseUrl, json.id as number, 'update'),
    type: 'Update',
    actor: actorId(baseUrl),
    published: new Date().toISOString(),
    to: [AS_PUBLIC],
    cc: [actorFollowersUrl(baseUrl)],
    object: article,
  };
}

export function buildDeleteActivity(
  baseUrl: string,
  postId: number | string,
): Record<string, unknown> {
  const objectId = articleId(baseUrl, postId);
  return {
    '@context': AS_CONTEXT,
    id: activityId(baseUrl, postId, 'delete'),
    type: 'Delete',
    actor: actorId(baseUrl),
    published: new Date().toISOString(),
    to: [AS_PUBLIC],
    cc: [actorFollowersUrl(baseUrl)],
    object: {
      id: objectId,
      type: 'Tombstone',
      formerType: 'Article',
      deleted: new Date().toISOString(),
    },
  };
}

export function buildAcceptFollow(
  baseUrl: string,
  followActivity: Record<string, unknown>,
): Record<string, unknown> {
  const followId =
    typeof followActivity.id === 'string'
      ? followActivity.id
      : `${actorId(baseUrl)}/accepts/${Date.now()}`;

  return {
    '@context': AS_CONTEXT,
    id: `${actorId(baseUrl)}/accepts/${encodeURIComponent(followId)}`,
    type: 'Accept',
    actor: actorId(baseUrl),
    object: followActivity,
  };
}

export function buildOutboxCollection(
  baseUrl: string,
  activities: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    '@context': AS_CONTEXT,
    id: actorOutboxUrl(baseUrl),
    type: 'OrderedCollection',
    totalItems: activities.length,
    orderedItems: activities,
  };
}

export function buildFollowersCollection(
  baseUrl: string,
  totalItems: number,
): Record<string, unknown> {
  return {
    '@context': AS_CONTEXT,
    id: actorFollowersUrl(baseUrl),
    type: 'OrderedCollection',
    totalItems,
    orderedItems: [],
  };
}

export function buildWebfingerJrd(
  baseUrl: string,
  resource: string,
): Record<string, unknown> {
  const username = actorUsername();
  const host = new URL(baseUrl).host;
  return {
    subject: resource.startsWith('acct:')
      ? resource
      : `acct:${username}@${host}`,
    aliases: [actorId(baseUrl)],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorId(baseUrl),
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: baseUrl,
      },
    ],
  };
}
