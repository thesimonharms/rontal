import { FediverseFollower } from '../models/fediverse-follower.js';
import { sha256DigestHeader, signRequest } from './http-signature.js';
import { ensureActorKeyPair } from './keys.js';
import { actorKeyId } from './objects.js';
import { fetchJson } from './remote.js';
import { isFediverseEnabled, resolvePublicBaseUrl } from './runtime.js';

export interface DeliveryTarget {
  inboxUrl: string;
}

/**
 * Collect unique delivery inboxes for current followers (prefer sharedInbox).
 */
export async function collectDeliveryTargets(): Promise<DeliveryTarget[]> {
  const followers = await FediverseFollower.query().getModels();
  const seen = new Set<string>();
  const targets: DeliveryTarget[] = [];

  for (const follower of followers) {
    const shared = follower.getAttribute('shared_inbox_url') as string | null;
    const inbox = (shared ||
      (follower.getAttribute('inbox_url') as string)) as string;
    if (!inbox || seen.has(inbox)) {
      continue;
    }
    seen.add(inbox);
    targets.push({ inboxUrl: inbox });
  }

  return targets;
}

/**
 * POST a signed ActivityPub activity to a remote inbox.
 */
export async function deliverToInbox(
  inboxUrl: string,
  activity: Record<string, unknown>,
  baseUrl?: string,
): Promise<{ ok: boolean; status: number }> {
  const origin = resolvePublicBaseUrl(baseUrl);
  const keys = await ensureActorKeyPair();
  const body = JSON.stringify(activity);
  const url = new URL(inboxUrl);
  const date = new Date().toUTCString();
  const digest = sha256DigestHeader(body);
  const signature = signRequest({
    privateKeyPem: keys.privateKeyPem,
    keyId: actorKeyId(origin),
    method: 'POST',
    path: `${url.pathname}${url.search}`,
    host: url.host,
    date,
    digest,
  });

  const result = await fetchJson(inboxUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/activity+json',
      accept: 'application/activity+json',
      host: url.host,
      date,
      digest,
      signature,
    },
    body,
  });

  return { ok: result.ok, status: result.status };
}

/**
 * Fan-out an activity to all followers. No-ops when federation is disabled.
 * Failures are collected; delivery is best-effort.
 */
export async function deliverToFollowers(
  activity: Record<string, unknown>,
  baseUrl?: string,
): Promise<Array<{ inboxUrl: string; ok: boolean; status: number }>> {
  if (!isFediverseEnabled()) {
    return [];
  }

  const targets = await collectDeliveryTargets();
  const results: Array<{ inboxUrl: string; ok: boolean; status: number }> = [];

  for (const target of targets) {
    try {
      const result = await deliverToInbox(target.inboxUrl, activity, baseUrl);
      results.push({ inboxUrl: target.inboxUrl, ...result });
    } catch {
      results.push({ inboxUrl: target.inboxUrl, ok: false, status: 0 });
    }
  }

  return results;
}
