import type { PondoknusaRequest } from '@pondoknusa/http';
import { Response } from '@pondoknusa/http';
import { Post } from '../models/post.js';

/**
 * GET /api/feed — RSS 2.0 feed of published posts.
 */
export async function rssFeed(request: PondoknusaRequest) {
  const posts = await Post.scope('published')
    .orderBy('published_at', 'desc')
    .getModels();

  const baseUrl = request.url.origin;
  const title = 'Blog Feed';
  const description = 'Latest posts';

  const items = posts
    .map((post) => {
      const json = post.toJSON();
      return `    <item>
      <title>${escapeXml(json.title as string)}</title>
      <link>${baseUrl}/api/posts/${json.slug}</link>
      <guid>${baseUrl}/api/posts/${json.slug}</guid>
      <pubDate>${json.published_at ? new Date(json.published_at as string).toUTCString() : ''}</pubDate>
      <description>${escapeXml(json.excerpt as string ?? '')}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return Response.xml(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}

/**
 * GET /api/feed/atom — Atom 1.0 feed of published posts.
 */
export async function atomFeed(request: PondoknusaRequest) {
  const posts = await Post.scope('published')
    .orderBy('published_at', 'desc')
    .getModels();

  const baseUrl = request.url.origin;
  const title = 'Blog Feed';
  const updated = posts.length > 0 && posts[0]?.getAttribute('published_at')
    ? new Date(posts[0].getAttribute('published_at') as string).toISOString()
    : new Date().toISOString();

  const entries = posts
    .map((post) => {
      const json = post.toJSON();
      return `    <entry>
      <title>${escapeXml(json.title as string)}</title>
      <link href="${baseUrl}/api/posts/${json.slug}"/>
      <id>${baseUrl}/api/posts/${json.slug}</id>
      <updated>${json.published_at ? new Date(json.published_at as string).toISOString() : updated}</updated>
      <summary>${escapeXml(json.excerpt as string ?? '')}</summary>
    </entry>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${baseUrl}/api/feed/atom" rel="self"/>
  <link href="${baseUrl}"/>
  <id>${baseUrl}</id>
  <updated>${updated}</updated>
${entries}
</feed>`;

  return Response.xml(xml, {
    headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
