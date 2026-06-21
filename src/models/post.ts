import { Model } from '@tyravel/database';
import type { ModelQueryBuilder } from '@tyravel/database';
import { Str } from '@tyravel/support';
import { renderMarkdown } from '../markdown.js';

export interface PostAttributes {
  id: number;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export class Post extends Model<PostAttributes> {
  static override table = 'posts';

  static override appends = ['rendered_body'];

  /**
   * Scope: only posts where `published_at` is not null and not in the future.
   *
   * SQL `<= now()` naturally excludes NULL values, so no explicit IS NOT NULL
   * is needed.
   */
  static scopePublished(builder: ModelQueryBuilder): ModelQueryBuilder {
    return builder
      .where('published_at', '<=', new Date().toISOString());
  }

  /**
   * Computed attribute: renders the raw Markdown body to HTML.
   */
  get rendered_body(): string | null {
    const body = this.getAttribute('body');
    return body ? renderMarkdown(body) : null;
  }

  /**
   * Generate a unique slug from a title, appending `-1`, `-2`, etc. on collision.
   * Pass `excludeId` to ignore the current post when updating.
   */
  static async uniqueSlug(title: string, excludeId?: number): Promise<string> {
    const base = Str.slug(title);
    let slug = base;
    let i = 1;

    while (true) {
      let query = Post.where('slug', slug);
      if (excludeId !== undefined) {
        query = query.where('id', '!=', excludeId);
      }
      const exists = await query.first();
      if (!exists) {
        break;
      }
      slug = `${base}-${i++}`;
    }

    return slug;
  }
}
