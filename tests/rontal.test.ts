import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteConnection, SchemaBuilder, Model } from '@tyravel/database';
import { TyravelRequest } from '@tyravel/http';
import { Post } from '../dist/models/post.js';
import { renderMarkdown } from '../dist/markdown.js';
import { PostController } from '../dist/controllers/post-controller.js';

const db = new SqliteConnection(':memory:');
const schema = new SchemaBuilder(db);

Model.setConnectionResolver(() => db);

async function setupDatabase() {
  await schema.create('posts', (table) => {
    table.id();
    table.string('title');
    table.string('slug');
    table.text('body');
    table.string('excerpt').nullable();
    table.string('published_at').nullable();
    table.timestamps();
  });
}

async function cleanup() {
  await schema.drop('posts');
}

describe('renderMarkdown', () => {
  it('converts markdown to HTML', () => {
    const html = renderMarkdown('# Hello');
    assert.ok(html.includes('<h1>Hello</h1>'));
  });

  it('returns empty-ish for empty input', () => {
    const html = renderMarkdown('');
    assert.equal(html.trim(), '');
  });
});

describe('Post model', () => {
  beforeEach(async () => {
    await setupDatabase();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('creates a post and retrieves it by slug', async () => {
    const post = await Post.create({
      title: 'My First Post',
      slug: 'my-first-post',
      body: '# Hello World',
      excerpt: 'A summary',
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    assert.ok(post.getAttribute('id'));

    const found = await Post.where('slug', 'my-first-post').firstModel();
    assert.ok(found);
    assert.equal(found!.getAttribute('title'), 'My First Post');
  });

  it('rendered_body accessor converts markdown to HTML', async () => {
    const post = await Post.create({
      title: 'Markdown Test',
      slug: 'markdown-test',
      body: '**bold** and [link](https://example.com)',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    assert.ok(post.rendered_body!.includes('<strong>bold</strong>'));
    assert.ok(post.rendered_body!.includes('<a href="https://example.com">link</a>'));
  });

  it('rendered_body is included in toJSON via appends', async () => {
    const post = await Post.create({
      title: 'JSON Test',
      slug: 'json-test',
      body: '## Heading',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const json = post.toJSON();
    assert.ok('rendered_body' in json);
    assert.ok(typeof json.rendered_body === 'string');
    assert.ok((json.rendered_body as string).includes('<h2>Heading</h2>'));
  });

  it('published scope excludes drafts (null published_at)', async () => {
    await Post.create({
      title: 'Published',
      slug: 'published',
      body: 'content',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await Post.create({
      title: 'Draft',
      slug: 'draft',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const published = await Post.scope('published').getModels();
    assert.equal(published.length, 1);
    assert.equal(published[0]!.getAttribute('slug'), 'published');
  });

  it('published scope excludes future-dated posts', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);

    await Post.create({
      title: 'Scheduled',
      slug: 'scheduled',
      body: 'content',
      excerpt: null,
      published_at: future.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const published = await Post.scope('published').getModels();
    assert.equal(published.length, 0);
  });

  it('uniqueSlug generates unique slugs on collision', async () => {
    await Post.create({
      title: 'My Post',
      slug: 'my-post',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const slug1 = await Post.uniqueSlug('My Post');
    assert.equal(slug1, 'my-post-1');

    await Post.create({
      title: 'My Post',
      slug: 'my-post-1',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const slug2 = await Post.uniqueSlug('My Post');
    assert.equal(slug2, 'my-post-2');
  });

  it('uniqueSlug excludes current post when updating', async () => {
    const post = await Post.create({
      title: 'Original Title',
      slug: 'original-title',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const slug = await Post.uniqueSlug('Original Title', post.getAttribute('id') as number);
    assert.equal(slug, 'original-title');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 20; i++) {
      await Post.create({
        title: `Post ${i}`,
        slug: `post-${i}`,
        body: 'content',
        excerpt: null,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const paginator = await Post.scope('published').paginateModels(15, 1);
    assert.equal(paginator.items.length, 15);
    assert.equal(paginator.total, 20);
    assert.equal(paginator.lastPage, 2);
    assert.equal(paginator.currentPage, 1);
  });

  it('updates a post', async () => {
    const post = await Post.create({
      title: 'Old Title',
      slug: 'old-title',
      body: 'old body',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await post.update({ title: 'New Title' });
    const fresh = await post.fresh();
    assert.equal(fresh!.getAttribute('title'), 'New Title');
  });

  it('deletes a post', async () => {
    const post = await Post.create({
      title: 'To Delete',
      slug: 'to-delete',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await post.delete();
    const found = await Post.find(post.getAttribute('id') as number);
    assert.equal(found, null);
  });

  it('returns null rendered_body for null body', async () => {
    // Create with empty body — text NOT NULL means we use empty string
    const post = await Post.create({
      title: 'Empty Body',
      slug: 'empty-body',
      body: '',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // body is empty string (falsy), so rendered_body returns null
    assert.equal(post.rendered_body, null);
  });
});

describe('PostController', () => {
  let controller: PostController;

  beforeEach(async () => {
    await setupDatabase();
    controller = new PostController();
  });

  afterEach(async () => {
    await cleanup();
  });

  function mockRequest(opts: {
    method?: string;
    url?: string;
    params?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  }) {
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : null;
    const request = new Request(opts.url ?? 'http://localhost/api/posts', {
      method: opts.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...opts.headers },
      body,
    });
    // Attach params by constructing a TyravelRequest-like object
    const tyravelReq = new TyravelRequest(request, opts.params ?? {});
    return tyravelReq;
  }

  it('index returns paginated published posts', async () => {
    await Post.create({
      title: 'Published Post',
      slug: 'published-post',
      body: '# Hello',
      excerpt: 'Summary',
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await Post.create({
      title: 'Draft Post',
      slug: 'draft-post',
      body: 'draft',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({ url: 'http://localhost/api/posts?page=1&per_page=15' });
    const res = await controller.index(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].title, 'Published Post');
    // Should not include body or rendered_body in list view
    assert.ok(!('body' in json.data[0]));
    assert.ok(!('rendered_body' in json.data[0]));
  });

  it('show returns full post with rendered_body', async () => {
    await Post.create({
      title: 'Detail Post',
      slug: 'detail-post',
      body: '# Heading',
      excerpt: 'Excerpt',
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      url: 'http://localhost/api/posts/detail-post',
      params: { slug: 'detail-post' },
    });
    const res = await controller.show(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.title, 'Detail Post');
    assert.ok(json.rendered_body);
    assert.ok(json.rendered_body.includes('<h1>Heading</h1>'));
  });

  it('show returns 404 for non-existent slug', async () => {
    const req = mockRequest({
      url: 'http://localhost/api/posts/nonexistent',
      params: { slug: 'nonexistent' },
    });
    const res = await controller.show(req);
    assert.equal(res.status, 404);
  });

  it('show returns 404 for draft (unpublished) post', async () => {
    await Post.create({
      title: 'Draft',
      slug: 'draft-only',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      url: 'http://localhost/api/posts/draft-only',
      params: { slug: 'draft-only' },
    });
    const res = await controller.show(req);
    assert.equal(res.status, 404);
  });

  it('store creates a new post with auto-generated slug', async () => {
    const req = mockRequest({
      method: 'POST',
      body: {
        title: 'New Post',
        body: '# Content',
        excerpt: 'Summary',
        published_at: new Date().toISOString(),
      },
    });

    const res = await controller.store(req);
    const json = await res.json();

    assert.equal(res.status, 201);
    assert.equal(json.title, 'New Post');
    assert.equal(json.slug, 'new-post');
    assert.ok(json.rendered_body.includes('<h1>Content</h1>'));

    // Verify it was saved
    const found = await Post.where('slug', 'new-post').firstModel();
    assert.ok(found);
  });

  it('store creates a draft when published_at is omitted', async () => {
    const req = mockRequest({
      method: 'POST',
      body: {
        title: 'Draft Post',
        body: 'content',
      },
    });

    const res = await controller.store(req);
    const json = await res.json();

    assert.equal(res.status, 201);
    assert.equal(json.published_at, null);
  });

  it('update modifies a post and regenerates slug on title change', async () => {
    const post = await Post.create({
      title: 'Old Title',
      slug: 'old-title',
      body: 'old body',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      method: 'PUT',
      body: { title: 'New Title' },
      params: { slug: 'old-title' },
    });

    const res = await controller.update(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.title, 'New Title');
    assert.equal(json.slug, 'new-title');
  });

  it('update returns 404 for non-existent slug', async () => {
    const req = mockRequest({
      method: 'PUT',
      body: { title: 'Updated' },
      params: { slug: 'nonexistent' },
    });

    const res = await controller.update(req);
    assert.equal(res.status, 404);
  });

  it('destroy deletes a post', async () => {
    await Post.create({
      title: 'To Delete',
      slug: 'to-delete',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      method: 'DELETE',
      params: { slug: 'to-delete' },
    });

    const res = await controller.destroy(req);
    assert.equal(res.status, 204);

    const found = await Post.where('slug', 'to-delete').firstModel();
    assert.equal(found, null);
  });

  it('drafts returns only unpublished posts', async () => {
    await Post.create({
      title: 'Published',
      slug: 'published-1',
      body: 'content',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await Post.create({
      title: 'Draft 1',
      slug: 'draft-1',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await Post.create({
      title: 'Draft 2',
      slug: 'draft-2',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({ url: 'http://localhost/api/posts/drafts?page=1&per_page=15' });
    const res = await controller.drafts(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.data.length, 2);
    assert.equal(json.total, 2);
  });

  it('publish sets published_at to now', async () => {
    const post = await Post.create({
      title: 'To Publish',
      slug: 'to-publish',
      body: 'content',
      excerpt: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      method: 'POST',
      params: { slug: 'to-publish' },
    });

    const res = await controller.publish(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.ok(json.published_at);

    // Should now appear in published scope
    const published = await Post.scope('published').getModels();
    assert.equal(published.length, 1);
  });

  it('unpublish sets published_at to null', async () => {
    await Post.create({
      title: 'To Unpublish',
      slug: 'to-unpublish',
      body: 'content',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({
      method: 'POST',
      params: { slug: 'to-unpublish' },
    });

    const res = await controller.unpublish(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.published_at, null);
  });
});
