import { Response } from '@pondoknusa/http';

const ACTIVITY_JSON = 'application/activity+json; charset=utf-8';
const JRD_JSON = 'application/jrd+json; charset=utf-8';

export function activityJson(
  data: unknown,
  init?: ResponseInit,
): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'content-type': ACTIVITY_JSON,
      ...(init?.headers ?? {}),
    },
  });
}

export function jrdJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'content-type': JRD_JSON,
      ...(init?.headers ?? {}),
    },
  });
}

export function accepted(): Response {
  return Response.json({}, { status: 202 });
}
