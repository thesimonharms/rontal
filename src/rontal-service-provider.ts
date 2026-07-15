import { Route, ServiceProvider } from '@pondoknusa/core';
import { registerRontalRoutes } from './routes/api.js';

/**
 * Rontal service provider.
 *
 * Register in your Pondoknusa app:
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
    await this.mergeConfigFrom(
      new URL('./config/rontal.js', import.meta.url).pathname,
      'rontal',
    );
  }

  override boot(): void {
    this.loadMigrationsFrom(
      new URL('./migrations/create_posts_table.js', import.meta.url).pathname,
    );

    Route.prefix('api').group(() => {
      registerRontalRoutes();
    });
  }
}
