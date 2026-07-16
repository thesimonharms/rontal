import { join } from 'node:path';
import { Route, ServiceProvider } from '@pondoknusa/core';
import { registerRontalRoutes } from './routes/api.js';

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
 * - Load the posts migration (runs with `pondoknusa migrate`)
 * - Merge default config under the `rontal` key
 * - Register all API routes under `/api`
 */
export class RontalServiceProvider extends ServiceProvider {
  override async register(): Promise<void> {
    this.loadMigrationsFrom(join(import.meta.dirname!, 'migrations'));
    await this.mergeConfigFrom(
      join(import.meta.dirname!, 'config', 'rontal.js'),
      'rontal',
    );
  }

  override boot(): void {
    Route.prefix('api').group(() => {
      registerRontalRoutes();
    });
  }
}
