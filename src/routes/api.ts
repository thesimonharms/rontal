import { Route } from '@pondoknusa/core';
import { PostController } from '../controllers/post-controller.js';
import { rssFeed, atomFeed } from '../controllers/feed-controller.js';
import { ActivityPubController } from '../controllers/activitypub-controller.js';
import { webfinger } from '../controllers/webfinger-controller.js';
import { isFediverseEnabled } from '../fediverse/runtime.js';

/**
 * Register all Rontal API routes.
 *
 * Should be called inside a Route.prefix('api').group() context — the service
 * provider handles the prefix.
 */
export function registerRontalRoutes(): void {
  // Public routes
  Route.get('/posts', [PostController, 'index']);
  Route.get('/posts/:slug', [PostController, 'show']);
  Route.get('/feed', rssFeed);
  Route.get('/feed/atom', atomFeed);

  // Authenticated routes (auth:api token guard)
  Route.middleware('auth:api').group(() => {
    Route.get('/posts/drafts', [PostController, 'drafts']);
    Route.post('/posts', [PostController, 'store']);
    Route.put('/posts/:slug', [PostController, 'update']);
    Route.delete('/posts/:slug', [PostController, 'destroy']);
    Route.post('/posts/:slug/publish', [PostController, 'publish']);
    Route.post('/posts/:slug/unpublish', [PostController, 'unpublish']);
  });
}

/**
 * Register ActivityPub + WebFinger routes when federation is enabled.
 *
 * Mounted at the application root (not under `/api`) so WebFinger and actor
 * URLs match common fediverse expectations.
 */
export function registerFediverseRoutes(): void {
  if (!isFediverseEnabled()) {
    return;
  }

  Route.get('/.well-known/webfinger', webfinger);
  Route.get('/ap/actor', [ActivityPubController, 'actor']);
  Route.get('/ap/actor/outbox', [ActivityPubController, 'outbox']);
  Route.get('/ap/actor/followers', [ActivityPubController, 'followers']);
  Route.post('/ap/actor/inbox', [ActivityPubController, 'inbox']);
  Route.get('/ap/posts/:id', [ActivityPubController, 'showPost']);
}
