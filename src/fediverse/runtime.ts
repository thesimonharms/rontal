import type { Application } from '@pondoknusa/core';

export interface FediverseSettings {
  enabled: boolean;
  username: string;
  display_name: string;
  summary: string;
  public_base_url: string;
  post_permalink: string;
}

export interface RontalSettings {
  per_page: number;
  feed_title: string;
  feed_description: string;
  fediverse: FediverseSettings;
}

const DEFAULTS: FediverseSettings = {
  enabled: false,
  username: 'blog',
  display_name: '',
  summary: '',
  public_base_url: '',
  post_permalink: '',
};

let application: Application | null = null;

/** Bind the host application so fediverse code can read `config.rontal`. */
export function bindFediverseApplication(app: Application): void {
  application = app;
}

/** Clear the bound application (tests). */
export function unbindFediverseApplication(): void {
  application = null;
}

export function getRontalSettings(): RontalSettings {
  if (!application) {
    return {
      per_page: 15,
      feed_title: 'Blog Feed',
      feed_description: 'Latest posts',
      fediverse: { ...DEFAULTS },
    };
  }

  const config = application.make('config') as {
    get: <T>(key: string, fallback?: T) => T;
  };

  const rontal = config.get<Partial<RontalSettings>>('rontal', {});
  const fediverse = {
    ...DEFAULTS,
    ...(rontal.fediverse ?? {}),
  };

  return {
    per_page: rontal.per_page ?? 15,
    feed_title: rontal.feed_title ?? 'Blog Feed',
    feed_description: rontal.feed_description ?? 'Latest posts',
    fediverse,
  };
}

export function isFediverseEnabled(): boolean {
  return Boolean(getRontalSettings().fediverse.enabled);
}

/**
 * Resolve the public origin used for actor/object IDs.
 * Prefers `public_base_url`, then falls back to `requestOrigin`.
 */
export function resolvePublicBaseUrl(requestOrigin?: string): string {
  const configured = getRontalSettings().fediverse.public_base_url.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, '');
  }
  throw new Error(
    'rontal.fediverse.public_base_url must be set when ActivityPub delivery runs outside a request context.',
  );
}

export function actorUsername(): string {
  return getRontalSettings().fediverse.username || 'blog';
}

export function actorDisplayName(): string {
  const settings = getRontalSettings();
  return settings.fediverse.display_name || settings.feed_title;
}

export function actorSummary(): string {
  const settings = getRontalSettings();
  return settings.fediverse.summary || settings.feed_description;
}

export function postPermalink(slug: string, baseUrl: string): string | null {
  const template = getRontalSettings().fediverse.post_permalink.trim();
  if (!template) {
    return null;
  }
  return template.replaceAll('{slug}', slug).replaceAll('{base}', baseUrl);
}
