# rontal

ꦫꦺꦴꦠꦭ꧀

A minimal, headless blog API package for [Pondoknusa](https://github.com/pondoknusa/pondoknusa). Ships a `Post` model, full CRUD controller, and API routes. Stores post bodies as Markdown and renders them server-side via `marked`.

> No opinions on auth, frontend, or theming — bring your own.

The name **rontal** (ꦫꦺꦴꦠꦭ꧀) is the Old Javanese ancestor of the Indonesian word *lontar* — the palmyra palm leaf used for manuscripts. This package is the TypeScript-native reimagining of [Lontar](https://github.com/thesimonharms/lontar), the Laravel headless blog API.

## Requirements

- **Node.js >= 26**
- A Pondoknusa application with `@pondoknusa/auth` configured (for authenticated endpoints)

## Installation

```bash
npm install rontal
```

Register the service provider in your app's `src/main.ts`:

```typescript
import { RontalServiceProvider } from 'rontal';

app.register(RontalServiceProvider);
```

Run migrations:

```bash
pondoknusa migrate
```

The service provider auto-registers API routes under `/api` and contributes the posts migration to your app's migration runner.

## Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | Paginated list of published posts (`title`, `slug`, `excerpt`, `published_at`) |
| `GET` | `/api/posts/:slug` | Full detail for a single published post (includes `rendered_body`) |
| `GET` | `/api/feed` | RSS 2.0 feed of published posts |
| `GET` | `/api/feed/atom` | Atom 1.0 feed of published posts |

*Posts with a `null` or future `published_at` are treated as drafts and excluded from public responses.*

### Authenticated (`auth:api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts/drafts` | Paginated list of unpublished posts |
| `POST` | `/api/posts` | Create a new post |
| `PUT` | `/api/posts/:slug` | Update a post |
| `DELETE` | `/api/posts/:slug` | Delete a post |
| `POST` | `/api/posts/:slug/publish` | Set `published_at` to now |
| `POST` | `/api/posts/:slug/unpublish` | Set `published_at` to null |

## Request Bodies

### `POST /api/posts`

```json
{
  "title": "My Post Title",
  "body": "Markdown content here.",
  "excerpt": "Optional short summary.",
  "published_at": "2026-06-20T00:00:00Z"
}
```

- `slug` is derived automatically from `title`.
- `excerpt` and `published_at` are optional. Omit `published_at` to save as a draft.

### `PUT /api/posts/:slug`

Same fields as above, all optional (uses `sometimes` validation). If `title` is updated, `slug` is regenerated.

## Markdown

Post bodies are stored as raw Markdown. The `Post` model exposes a `rendered_body` computed attribute that converts the body to HTML via `marked`:

```typescript
import { Post } from 'rontal';

const post = await Post.where('slug', 'my-post').firstModel();
post.rendered_body; // HTML string
```

`rendered_body` is automatically included in JSON serialization via the model's `appends` list.

## Post Model

```typescript
import { Post } from 'rontal';

// Published posts (not null, not future-dated)
const posts = await Post.scope('published').getModels();

// All posts including drafts
const all = await Post.all();

// Find by slug
const post = await Post.where('slug', 'my-post').firstModel();

// Generate a unique slug
const slug = await Post.uniqueSlug('My Post Title');
```

## Configuration

Default config is merged under the `rontal` key. Override by creating `config/rontal.ts` in your app:

```typescript
export default {
  per_page: 15,
  feed_title: 'My Blog',
  feed_description: 'Latest posts from my blog',
};
```

## License

MIT
