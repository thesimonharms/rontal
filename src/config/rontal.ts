/**
 * Default configuration for Rontal.
 *
 * Consumers can override any key by creating `config/rontal.ts` in their app.
 */
export default {
  per_page: 15,
  feed_title: 'Blog Feed',
  feed_description: 'Latest posts',

  /**
   * Optional one-way ActivityPub publisher.
   *
   * When `enabled` is true, Rontal exposes WebFinger + actor/outbox/inbox routes
   * and fans out Create/Update/Delete activities to followers on publish.
   */
  fediverse: {
    enabled: false,
    /** Local part of the acct URI, e.g. `blog` → `@blog@example.com`. */
    username: 'blog',
    /** Display name on the actor. Empty falls back to `feed_title`. */
    display_name: '',
    /** Actor summary. Empty falls back to `feed_description`. */
    summary: '',
    /**
     * Absolute public origin used for actor/object IDs and delivery
     * (e.g. `https://blog.example.com`). Required for outbound fan-out when
     * enabled; discovery endpoints fall back to the request origin when empty.
     */
    public_base_url: '',
    /**
     * Optional HTML permalink template for the Article `url` field.
     * Use `{slug}` as a placeholder (e.g. `https://example.com/posts/{slug}`).
     * Empty omits a separate permalink (object `id` is still present).
     */
    post_permalink: '',
  },
} as const;
