import type { PondoknusaRequest } from '@pondoknusa/http';
import { Response } from '@pondoknusa/http';
import { buildWebfingerJrd } from '../fediverse/objects.js';
import { jrdJson } from '../fediverse/response.js';
import {
  actorUsername,
  isFediverseEnabled,
  resolvePublicBaseUrl,
} from '../fediverse/runtime.js';

/**
 * GET /.well-known/webfinger?resource=acct:user@host
 */
export async function webfinger(request: PondoknusaRequest) {
  if (!isFediverseEnabled()) {
    return Response.json({ message: 'Not Found' }, { status: 404 });
  }

  const resource = request.query('resource');
  if (!resource) {
    return Response.json(
      { message: 'Missing resource parameter' },
      { status: 400 },
    );
  }

  let baseUrl: string;
  try {
    baseUrl = resolvePublicBaseUrl(request.url.origin);
  } catch {
    return Response.json(
      { message: 'Fediverse public_base_url is not configured' },
      { status: 503 },
    );
  }

  const host = new URL(baseUrl).host;
  const expected = `acct:${actorUsername()}@${host}`;
  const normalized = resource.trim().toLowerCase();
  const actorUrl = `${baseUrl}/ap/actor`.toLowerCase();

  if (
    normalized !== expected.toLowerCase() &&
    normalized !== actorUrl &&
    normalized !== `${baseUrl}/ap/actor`.toLowerCase()
  ) {
    return Response.json({ message: 'Not Found' }, { status: 404 });
  }

  return jrdJson(buildWebfingerJrd(baseUrl, expected));
}
