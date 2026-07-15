import { Route } from '@pondoknusa/core';
import type { RouteHandler } from '@pondoknusa/http';
import { PostController } from '../controllers/post-controller.js';
import { rssFeed, atomFeed } from '../controllers/feed-controller.js';

/**
 * Register all Rontal API routes.
 *
 * Should be called inside a Route.prefix('api').group() context — the service
 * provider handles the prefix.
 */
export function registerRontalRoutes(): void {
  // Public routes
  Route.get('/posts', [PostController, 'index'] as unknown as RouteHandler);
  Route.get('/posts/:slug', [PostController, 'show'] as unknown as RouteHandler);
  Route.get('/feed', rssFeed);
  Route.get('/feed/atom', atomFeed);

  // Authenticated routes (auth:api token guard)
  Route.middleware('auth:api').get('/posts/drafts', [PostController, 'drafts'] as unknown as RouteHandler);
  Route.middleware('auth:api').post('/posts', [PostController, 'store'] as unknown as RouteHandler);
  Route.middleware('auth:api').put('/posts/:slug', [PostController, 'update'] as unknown as RouteHandler);
  Route.middleware('auth:api').delete('/posts/:slug', [PostController, 'destroy'] as unknown as RouteHandler);
  Route.middleware('auth:api').post('/posts/:slug/publish', [PostController, 'publish'] as unknown as RouteHandler);
  Route.middleware('auth:api').post('/posts/:slug/unpublish', [PostController, 'unpublish'] as unknown as RouteHandler);
}
