import type { TyravelRequest } from '@tyravel/http';
import { Response } from '@tyravel/http';
import { validateRequest } from '@tyravel/validation';
import { Post } from '../models/post.js';
import { LengthAwarePaginator } from '@tyravel/database';

export class PostController {
  /**
   * GET /api/posts — paginated list of published posts.
   */
  async index(request: TyravelRequest) {
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
  async show(request: TyravelRequest) {
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
  async store(request: TyravelRequest) {
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

    return Response.json(post.toJSON(), { status: 201 });
  }

  /**
   * PUT /api/posts/:slug — update a post.
   */
  async update(request: TyravelRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

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
    const fresh = await post.fresh();

    return Response.json(fresh?.toJSON() ?? post.toJSON());
  }

  /**
   * DELETE /api/posts/:slug — delete a post.
   */
  async destroy(request: TyravelRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    await post.delete();

    return Response.noContent();
  }

  /**
   * GET /api/posts/drafts — paginated list of unpublished posts.
   */
  async drafts(request: TyravelRequest) {
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
  async publish(request: TyravelRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    await post.update({
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const fresh = await post.fresh();
    return Response.json(fresh?.toJSON() ?? post.toJSON());
  }

  /**
   * POST /api/posts/:slug/unpublish — set published_at to null.
   */
  async unpublish(request: TyravelRequest) {
    const slug = request.param('slug');
    const post = await Post.where('slug', slug!).firstModel();

    if (!post) {
      return Response.json({ message: 'Post not found' }, { status: 404 });
    }

    await post.update({
      published_at: null,
      updated_at: new Date().toISOString(),
    });

    const fresh = await post.fresh();
    return Response.json(fresh?.toJSON() ?? post.toJSON());
  }
}
