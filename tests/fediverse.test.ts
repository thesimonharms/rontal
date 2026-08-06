import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { SqliteConnection, SchemaBuilder, Model } from '@pondoknusa/database';
import { PondoknusaRequest } from '@pondoknusa/http';
import { ConfigRepository } from '@pondoknusa/config';
import {
  Application,
  DatabaseServiceProvider,
  setRouteApplication,
} from '@pondoknusa/core';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Post } from '../dist/models/post.js';
import { FediverseFollower } from '../dist/models/fediverse-follower.js';
import { FediverseActorKey } from '../dist/models/fediverse-actor-key.js';
import { PostController } from '../dist/controllers/post-controller.js';
import { ActivityPubController } from '../dist/controllers/activitypub-controller.js';
import { webfinger } from '../dist/controllers/webfinger-controller.js';
import {
  bindFediverseApplication,
  unbindFediverseApplication,
} from '../dist/fediverse/runtime.js';
import {
  setFediverseFetch,
  resetFediverseFetch,
} from '../dist/fediverse/remote.js';
import {
  generateRsaKeyPair,
  sha256DigestHeader,
  signRequest,
  verifyRequestSignature,
} from '../dist/fediverse/http-signature.js';
import { buildCreateActivity, actorId } from '../dist/fediverse/objects.js';
import { ensureActorKeyPair } from '../dist/fediverse/keys.js';

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
  await schema.create('fediverse_actor_keys', (table) => {
    table.id();
    table.text('private_key_pem');
    table.text('public_key_pem');
    table.timestamps();
  });
  await schema.create('fediverse_followers', (table) => {
    table.id();
    table.string('actor_id', 512).unique();
    table.string('inbox_url', 512);
    table.string('shared_inbox_url', 512).nullable();
    table.timestamps();
  });
}

async function cleanup() {
  await schema.drop('fediverse_followers');
  await schema.drop('fediverse_actor_keys');
  await schema.drop('posts');
}

function mockRequest(opts: {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: string;
}) {
  const body =
    opts.rawBody !== undefined
      ? opts.rawBody
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : null;
  const request = new Request(opts.url ?? 'http://localhost/ap/actor', {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body,
  });
  return new PondoknusaRequest(request, opts.params ?? {});
}

function enableFediverse(overrides: Record<string, unknown> = {}) {
  const app = new Application();
  app.instance(
    'config',
    new ConfigRepository({
      rontal: {
        feed_title: 'Test Blog',
        feed_description: 'A test blog',
        fediverse: {
          enabled: true,
          username: 'blog',
          public_base_url: 'https://blog.test',
          post_permalink: 'https://blog.test/posts/{slug}',
          ...overrides,
        },
      },
    }),
  );
  bindFediverseApplication(app);
  return app;
}

describe('HTTP signatures', () => {
  it('signs and verifies a request', () => {
    const keys = generateRsaKeyPair();
    const body = JSON.stringify({ type: 'Follow' });
    const digest = sha256DigestHeader(body);
    const date = new Date().toUTCString();
    const signature = signRequest({
      privateKeyPem: keys.privateKeyPem,
      keyId: 'https://remote.test/actor#main-key',
      method: 'POST',
      path: '/ap/actor/inbox',
      host: 'blog.test',
      date,
      digest,
    });

    const headers = new Headers({
      host: 'blog.test',
      date,
      digest,
      signature,
    });

    assert.equal(
      verifyRequestSignature({
        publicKeyPem: keys.publicKeyPem,
        signatureHeader: signature,
        method: 'POST',
        path: '/ap/actor/inbox',
        headers,
        body,
      }),
      true,
    );
  });
});

describe('ActivityPub publisher', () => {
  const controller = new ActivityPubController();
  let delivered: Array<{ url: string; body: string; headers: Headers }>;

  beforeEach(async () => {
    await setupDatabase();
    enableFediverse();
    delivered = [];
    resetFediverseFetch();
  });

  afterEach(async () => {
    unbindFediverseApplication();
    resetFediverseFetch();
    await cleanup();
  });

  it('serves webfinger for the configured acct', async () => {
    const req = mockRequest({
      url: 'https://blog.test/.well-known/webfinger?resource=acct:blog@blog.test',
    });
    const res = await webfinger(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.subject, 'acct:blog@blog.test');
    assert.equal(json.links[0].href, 'https://blog.test/ap/actor');
    assert.match(
      res.headers.get('content-type') ?? '',
      /application\/jrd\+json/,
    );
  });

  it('returns 404 webfinger for unknown acct', async () => {
    const req = mockRequest({
      url: 'https://blog.test/.well-known/webfinger?resource=acct:other@blog.test',
    });
    const res = await webfinger(req);
    assert.equal(res.status, 404);
  });

  it('serves an actor document with a generated public key', async () => {
    const req = mockRequest({ url: 'https://blog.test/ap/actor' });
    const res = await controller.actor(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.id, 'https://blog.test/ap/actor');
    assert.equal(json.type, 'Service');
    assert.equal(json.preferredUsername, 'blog');
    assert.equal(json.name, 'Test Blog');
    assert.ok(json.publicKey.publicKeyPem.includes('BEGIN PUBLIC KEY'));
    assert.equal(await FediverseActorKey.query().count(), 1);

    // PEM should be parseable
    createPublicKey(json.publicKey.publicKeyPem);
  });

  it('serves outbox Create activities for published posts', async () => {
    await Post.create({
      title: 'Hello Fediverse',
      slug: 'hello-fediverse',
      body: '# Hi',
      excerpt: 'Hi there',
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = mockRequest({ url: 'https://blog.test/ap/actor/outbox' });
    const res = await controller.outbox(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.type, 'OrderedCollection');
    assert.equal(json.totalItems, 1);
    assert.equal(json.orderedItems[0].type, 'Create');
    assert.equal(json.orderedItems[0].object.type, 'Article');
    assert.equal(json.orderedItems[0].object.name, 'Hello Fediverse');
    assert.equal(
      json.orderedItems[0].object.url,
      'https://blog.test/posts/hello-fediverse',
    );
  });

  it('serves an Article object by id', async () => {
    const post = await Post.create({
      title: 'Article',
      slug: 'article',
      body: 'Body',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const id = post.getAttribute('id') as number;
    const req = mockRequest({
      url: `https://blog.test/ap/posts/${id}`,
      params: { id: String(id) },
    });
    const res = await controller.showPost(req);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.type, 'Article');
    assert.equal(json.id, `https://blog.test/ap/posts/${id}`);
  });

  it('accepts a signed Follow and stores the follower', async () => {
    const remoteKeys = generateRsaKeyPair();
    const remoteActor = 'https://mastodon.test/users/alice';
    const remoteInbox = 'https://mastodon.test/users/alice/inbox';

    setFediverseFetch(async (input, init) => {
      const url = String(input);
      if (url === remoteActor) {
        return new Response(
          JSON.stringify({
            id: remoteActor,
            inbox: remoteInbox,
            publicKey: {
              id: `${remoteActor}#main-key`,
              owner: remoteActor,
              publicKeyPem: remoteKeys.publicKeyPem,
            },
            endpoints: { sharedInbox: 'https://mastodon.test/inbox' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/activity+json' },
          },
        );
      }

      // Accept delivery
      delivered.push({
        url,
        body: String(init?.body ?? ''),
        headers: new Headers(init?.headers as HeadersInit),
      });
      return new Response('', { status: 202 });
    });

    const follow = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${remoteActor}/follows/1`,
      type: 'Follow',
      actor: remoteActor,
      object: actorId('https://blog.test'),
    };
    const rawBody = JSON.stringify(follow);
    const digest = sha256DigestHeader(rawBody);
    const date = new Date().toUTCString();
    const signature = signRequest({
      privateKeyPem: remoteKeys.privateKeyPem,
      keyId: `${remoteActor}#main-key`,
      method: 'POST',
      path: '/ap/actor/inbox',
      host: 'blog.test',
      date,
      digest,
    });

    const req = mockRequest({
      method: 'POST',
      url: 'https://blog.test/ap/actor/inbox',
      rawBody,
      headers: {
        'content-type': 'application/activity+json',
        host: 'blog.test',
        date,
        digest,
        signature,
      },
    });

    const res = await controller.inbox(req);
    assert.equal(res.status, 202);

    const followers = await FediverseFollower.query().getModels();
    assert.equal(followers.length, 1);
    assert.equal(followers[0]!.getAttribute('actor_id'), remoteActor);
    assert.equal(
      followers[0]!.getAttribute('shared_inbox_url'),
      'https://mastodon.test/inbox',
    );

    assert.equal(delivered.length, 1);
    const accept = JSON.parse(delivered[0]!.body);
    assert.equal(accept.type, 'Accept');
    assert.equal(accept.object.type, 'Follow');
  });

  it('removes a follower on Undo Follow', async () => {
    const remoteKeys = generateRsaKeyPair();
    const remoteActor = 'https://mastodon.test/users/bob';
    const remoteInbox = 'https://mastodon.test/users/bob/inbox';

    await FediverseFollower.create({
      actor_id: remoteActor,
      inbox_url: remoteInbox,
      shared_inbox_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    setFediverseFetch(async (input) => {
      const url = String(input);
      if (url === remoteActor) {
        return new Response(
          JSON.stringify({
            id: remoteActor,
            inbox: remoteInbox,
            publicKey: {
              id: `${remoteActor}#main-key`,
              owner: remoteActor,
              publicKeyPem: remoteKeys.publicKeyPem,
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/activity+json' },
          },
        );
      }
      return new Response('', { status: 202 });
    });

    const undo = {
      type: 'Undo',
      actor: remoteActor,
      object: {
        type: 'Follow',
        actor: remoteActor,
        object: actorId('https://blog.test'),
      },
    };
    const rawBody = JSON.stringify(undo);
    const digest = sha256DigestHeader(rawBody);
    const date = new Date().toUTCString();
    const signature = signRequest({
      privateKeyPem: remoteKeys.privateKeyPem,
      keyId: `${remoteActor}#main-key`,
      method: 'POST',
      path: '/ap/actor/inbox',
      host: 'blog.test',
      date,
      digest,
    });

    const req = mockRequest({
      method: 'POST',
      url: 'https://blog.test/ap/actor/inbox',
      rawBody,
      headers: {
        host: 'blog.test',
        date,
        digest,
        signature,
      },
    });

    const res = await controller.inbox(req);
    assert.equal(res.status, 202);
    assert.equal(await FediverseFollower.query().count(), 0);
  });

  it('fans out Create on publish to followers', async () => {
    await ensureActorKeyPair();
    await FediverseFollower.create({
      actor_id: 'https://mastodon.test/users/carol',
      inbox_url: 'https://mastodon.test/users/carol/inbox',
      shared_inbox_url: 'https://mastodon.test/inbox',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    setFediverseFetch(async (input, init) => {
      delivered.push({
        url: String(input),
        body: String(init?.body ?? ''),
        headers: new Headers(init?.headers as HeadersInit),
      });
      return new Response('', { status: 202 });
    });

    const posts = new PostController();
    await Post.create({
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
      url: 'https://blog.test/api/posts/to-publish/publish',
      params: { slug: 'to-publish' },
    });
    const res = await posts.publish(req);
    assert.equal(res.status, 200);

    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]!.url, 'https://mastodon.test/inbox');
    const activity = JSON.parse(delivered[0]!.body);
    assert.equal(activity.type, 'Create');
    assert.equal(activity.object.type, 'Article');
    assert.ok(delivered[0]!.headers.get('signature'));
    assert.ok(delivered[0]!.headers.get('digest'));
  });

  it('fans out Delete on unpublish', async () => {
    await ensureActorKeyPair();
    await FediverseFollower.create({
      actor_id: 'https://mastodon.test/users/dave',
      inbox_url: 'https://mastodon.test/users/dave/inbox',
      shared_inbox_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    setFediverseFetch(async (input, init) => {
      delivered.push({
        url: String(input),
        body: String(init?.body ?? ''),
        headers: new Headers(init?.headers as HeadersInit),
      });
      return new Response('', { status: 202 });
    });

    await Post.create({
      title: 'Live',
      slug: 'live',
      body: 'content',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const posts = new PostController();
    const res = await posts.unpublish(
      mockRequest({
        method: 'POST',
        params: { slug: 'live' },
      }),
    );
    assert.equal(res.status, 200);

    assert.equal(delivered.length, 1);
    const activity = JSON.parse(delivered[0]!.body);
    assert.equal(activity.type, 'Delete');
    assert.equal(activity.object.type, 'Tombstone');
  });

  it('does nothing when federation is disabled', async () => {
    unbindFediverseApplication();
    const app = new Application();
    app.instance(
      'config',
      new ConfigRepository({
        rontal: { fediverse: { enabled: false } },
      }),
    );
    bindFediverseApplication(app);

    const req = mockRequest({ url: 'https://blog.test/ap/actor' });
    const res = await controller.actor(req);
    assert.equal(res.status, 404);
  });

  it('builds Create activities with stable object ids', async () => {
    const post = await Post.create({
      title: 'Stable',
      slug: 'stable',
      body: 'x',
      excerpt: null,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const activity = buildCreateActivity('https://blog.test', post);
    assert.equal(
      (activity.object as Record<string, unknown>).id,
      `https://blog.test/ap/posts/${post.getAttribute('id')}`,
    );
  });
});

describe('Fediverse routes registration', () => {
  it('registers ActivityPub routes when enabled', async () => {
    const { RontalServiceProvider } = await import(
      '../dist/rontal-service-provider.js'
    );

    const root = mkdtempSync(join(tmpdir(), 'rontal-ap-'));
    mkdirSync(join(root, 'database/migrations'), { recursive: true });

    try {
      const app = new Application(root);
      app.instance(
        'config',
        new ConfigRepository({
          database: {
            default: 'sqlite',
            connections: {
              sqlite: { driver: 'sqlite', database: ':memory:' },
            },
          },
          rontal: {
            fediverse: {
              enabled: true,
              public_base_url: 'https://blog.test',
            },
          },
        }),
      );
      setRouteApplication(app);
      app.middleware('auth:api', async (_request, next) => next());
      app.register(DatabaseServiceProvider);
      app.register(RontalServiceProvider);
      await app.boot();

      const patterns = new Set(
        app
          .router()
          .listRoutes()
          .map((route) => `${route.method} ${route.uri}`),
      );

      for (const expected of [
        'GET /.well-known/webfinger',
        'GET /ap/actor',
        'GET /ap/actor/outbox',
        'GET /ap/actor/followers',
        'POST /ap/actor/inbox',
        'GET /ap/posts/:id',
      ]) {
        assert.ok(patterns.has(expected), `missing route ${expected}`);
      }
    } finally {
      unbindFediverseApplication();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
