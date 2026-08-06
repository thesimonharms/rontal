import { join } from 'node:path';
import { Route, ServiceProvider } from '@pondoknusa/core';
import { bindFediverseApplication } from './fediverse/runtime.js';
import {
  registerFediverseRoutes,
  registerRontalRoutes,
} from './routes/api.js';

/**
 * Rontal service provider.
 *
 * Register in your Pondoknusa app (after `setRouteApplication(app)`):
 *
 * ```typescript
 * import { RontalServiceProvider } from 'rontal';
 *
 * app.register(RontalServiceProvider);
 * ```
 *
 * This will:
 * - Load the posts + fediverse migrations (runs with `pondoknusa migrate`)
 * - Merge default config under the `rontal` key
 * - Register all API routes under `/api`
 * - When `rontal.fediverse.enabled` is true, register WebFinger + ActivityPub
 *   publisher routes
 */
export class RontalServiceProvider extends ServiceProvider {
  override async register(): Promise<void> {
    this.loadMigrationsFrom(join(import.meta.dirname!, 'migrations'));
    await this.mergeConfigFrom(
      join(import.meta.dirname!, 'config', 'rontal.js'),
      'rontal',
    );
    bindFediverseApplication(this.app);
  }

  override boot(): void {
    Route.prefix('api').group(() => {
      registerRontalRoutes();
    });
    registerFediverseRoutes();
  }
}
