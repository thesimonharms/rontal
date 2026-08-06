export interface RemoteActor {
  id: string;
  inbox: string;
  sharedInbox: string | null;
  publicKeyPem: string | null;
}

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = globalThis.fetch.bind(globalThis);

/** Override fetch (tests). */
export function setFediverseFetch(fn: FetchLike): void {
  fetchImpl = fn;
}

export function resetFediverseFetch(): void {
  fetchImpl = globalThis.fetch.bind(globalThis);
}

export async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown; headers: Headers }> {
  const response = await fetchImpl(url, init);
  let json: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    json,
    headers: response.headers,
  };
}

/**
 * Resolve a remote actor document by URL (or by fetching a linked object).
 */
export async function fetchRemoteActor(actorUrl: string): Promise<RemoteActor | null> {
  const result = await fetchJson(actorUrl, {
    headers: {
      accept: 'application/activity+json, application/ld+json',
    },
  });

  if (!result.ok || !result.json || typeof result.json !== 'object') {
    return null;
  }

  const doc = result.json as Record<string, unknown>;
  const inbox = typeof doc.inbox === 'string' ? doc.inbox : null;
  if (!inbox || typeof doc.id !== 'string') {
    return null;
  }

  const endpoints =
    doc.endpoints && typeof doc.endpoints === 'object'
      ? (doc.endpoints as Record<string, unknown>)
      : null;
  const sharedInbox =
    endpoints && typeof endpoints.sharedInbox === 'string'
      ? endpoints.sharedInbox
      : null;

  let publicKeyPem: string | null = null;
  const publicKey = doc.publicKey;
  if (publicKey && typeof publicKey === 'object') {
    const pem = (publicKey as Record<string, unknown>).publicKeyPem;
    if (typeof pem === 'string') {
      publicKeyPem = pem;
    }
  } else if (typeof publicKey === 'string') {
    const keyDoc = await fetchJson(publicKey, {
      headers: {
        accept: 'application/activity+json, application/ld+json',
      },
    });
    if (keyDoc.ok && keyDoc.json && typeof keyDoc.json === 'object') {
      const pem = (keyDoc.json as Record<string, unknown>).publicKeyPem;
      if (typeof pem === 'string') {
        publicKeyPem = pem;
      }
    }
  }

  return {
    id: doc.id,
    inbox,
    sharedInbox,
    publicKeyPem,
  };
}
