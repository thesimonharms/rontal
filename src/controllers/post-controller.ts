import type { PondoknusaRequest } from '@pondoknusa/http';
import { Response } from '@pondoknusa/http';
import { validateRequest } from '@pondoknusa/validation';
import {
  announceCreate,
  announceDelete,
  announceUpdate,
} from '../fediverse/announce.js';
import { Post } from '../models/post.js';

function wasPublished(publishedAt: unknown): boolean {
  if (!publishedAt) {
    return false;
  }
  return new Date(publishedAt as string).getTime() <= Date.now();
}

export class PostController {
  /**
   * GET /api/posts — paginated list of published posts.
   */
  async index(request: PondoknusaRequest) {
    const page = request.page();
    const perPage = request.perPage();
    const posts = await Post.scope('published')
      .orderBy('published_at', 'desc')
      .paginateModels(perPage, page);

    // Serialize with only the public columns.
    const data = posts.items.map((post) => {
      const json = post.toJSON();
      return {
        title: json.title,
        slug: json.slug,
        excerpt: json.excerpt,
        published_at: json.published_at,
      };
    });

    return Response.json({
      data,
      ...posts.meta(),
    });
  }

  /**
   * GET /api/posts/:slug — full detail for a single published post.
   */
  async show(request: PondoknusaRequest) {
    const slug = request.param('slug');
    const post = await Post.scope('published')
      .where('slug', slug!)
      .firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    return Response.json(post.toJSON());
  }

  /**
   * POST /api/posts — create a new post.
   */
  async store(request: PondoknusaRequest) {
    const data = await validateRequest(request, {
      title: 'required|string|max:255',
      body: 'required|string',
      excerpt: 'string',
      published_at: 'string',
    });

    const slug = await Post.uniqueSlug(data.title as string);

    const post = await Post.create({
      title: data.title!,
      slug,
      body: data.body!,
      excerpt: (data.excerpt as string) ?? null,
      published_at: (data.published_at as string) ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await announceCreate(post);

    return Response.json(post.toJSON(), { status: 201 });
  }

  /**
   * PUT /api/posts/:slug — update a post.
   */
  async update(request: PondoknusaRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    const previouslyPublished = wasPublished(
      post.getAttribute('published_at'),
    );

    const data = await validateRequest(request, {
      title: 'sometimes|string|max:255',
      body: 'sometimes|string',
      excerpt: 'sometimes|string',
      published_at: 'sometimes|string',
    });

    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) {
      updates.title = data.title;
      updates.slug = await Post.uniqueSlug(
        data.title as string,
        post.getAttribute('id') as number,
      );
    }
    if (data.body !== undefined) {
      updates.body = data.body;
    }
    if (data.excerpt !== undefined) {
      updates.excerpt = data.excerpt;
    }
    if (data.published_at !== undefined) {
      updates.published_at = data.published_at;
    }

    updates.updated_at = new Date().toISOString();

    await post.update(updates);
    const fresh = (await post.fresh()) as Post | null;
    const current = fresh ?? post;
    const nowPublished = wasPublished(current.getAttribute('published_at'));

    if (!previouslyPublished && nowPublished) {
      await announceCreate(current);
    } else if (previouslyPublished && !nowPublished) {
      await announceDelete(
        current.getAttribute('id') as number,
        true,
      );
    } else if (previouslyPublished && nowPublished) {
      await announceUpdate(current);
    }

    return Response.json(current.toJSON());
  }

  /**
   * DELETE /api/posts/:slug — delete a post.
   */
  async destroy(request: PondoknusaRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    const id = post.getAttribute('id') as number;
    const published = wasPublished(post.getAttribute('published_at'));
    await post.delete();
    await announceDelete(id, published);

    return Response.noContent();
  }

  /**
   * GET /api/posts/drafts — paginated list of unpublished posts.
   */
  async drafts(request: PondoknusaRequest) {
    const page = request.page();
    const perPage = request.perPage();

    const paginator = await Post.query()
      .whereNull('published_at')
      .orderBy('created_at', 'desc')
      .paginateModels(perPage, page);

    const data = paginator.items.map((post) => {
      const json = post.toJSON();
      return {
        title: json.title,
        slug: json.slug,
        excerpt: json.excerpt,
        created_at: json.created_at,
      };
    });

    return Response.json({
      data,
      ...paginator.meta(),
    });
  }

  /**
   * POST /api/posts/:slug/publish — set published_at to now.
   */
  async publish(request: PondoknusaRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    await post.update({
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const fresh = (await post.fresh()) as Post | null;
    const current = fresh ?? post;
    await announceCreate(current);

    return Response.json(current.toJSON());
  }

  /**
   * POST /api/posts/:slug/unpublish — set published_at to null.
   */
  async unpublish(request: PondoknusaRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    const id = post.getAttribute('id') as number;
    const published = wasPublished(post.getAttribute('published_at'));

    await post.update({
      published_at: null,
      updated_at: new Date().toISOString(),
    });

    await announceDelete(id, published);

    const fresh = (await post.fresh()) as Post | null;
    return Response.json(fresh?.toJSON() ?? post.toJSON());
  }
}
