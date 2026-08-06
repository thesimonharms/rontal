import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';

export function generateRsaKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
  };
}

export function sha256DigestHeader(body: string): string {
  const digest = createHash('sha256').update(body, 'utf8').digest('base64');
  return `SHA-256=${digest}`;
}

/**
 * Build a draft-cavage HTTP Signature header value for an outbound POST.
 */
export function signRequest(opts: {
  privateKeyPem: string;
  keyId: string;
  method: string;
  path: string;
  host: string;
  date: string;
  digest: string;
}): string {
  const requestTarget = `${opts.method.toLowerCase()} ${opts.path}`;
  const signingString = [
    `(request-target): ${requestTarget}`,
    `host: ${opts.host}`,
    `date: ${opts.date}`,
    `digest: ${opts.digest}`,
  ].join('\n');

  const signer = createSign('RSA-SHA256');
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(opts.privateKeyPem, 'base64');

  return [
    `keyId="${opts.keyId}"`,
    'algorithm="rsa-sha256"',
    'headers="(request-target) host date digest"',
    `signature="${signature}"`,
  ].join(',');
}

export function parseSignatureHeader(
  header: string,
): Record<string, string> | null {
  const result: Record<string, string> = {};
  const parts = header.match(/(?:^|,)\s*([a-zA-Z]+)=(?:"([^"]*)"|([^,]*))/g);
  if (!parts) {
    return null;
  }

  for (const part of parts) {
    const match = part.match(/([a-zA-Z]+)=(?:"([^"]*)"|([^,]*))/);
    if (!match) {
      continue;
    }
    const key = match[1]!;
    const value = match[2] ?? match[3] ?? '';
    result[key] = value;
  }

  return result.keyId && result.signature && result.headers ? result : null;
}

/**
 * Verify a draft-cavage HTTP Signature on an inbound request.
 */
export function verifyRequestSignature(opts: {
  publicKeyPem: string;
  signatureHeader: string;
  method: string;
  path: string;
  headers: Headers;
  body: string;
}): boolean {
  const parsed = parseSignatureHeader(opts.signatureHeader);
  if (!parsed) {
    return false;
  }

  const headerNames = parsed.headers!.split(/\s+/);
  const lines: string[] = [];

  for (const name of headerNames) {
    if (name === '(request-target)') {
      lines.push(
        `(request-target): ${opts.method.toLowerCase()} ${opts.path}`,
      );
      continue;
    }

    const value = opts.headers.get(name);
    if (value === null) {
      return false;
    }
    lines.push(`${name.toLowerCase()}: ${value}`);
  }

  if (headerNames.includes('digest')) {
    const expected = sha256DigestHeader(opts.body);
    const actual = opts.headers.get('digest');
    if (actual !== expected) {
      return false;
    }
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(lines.join('\n'));
  verifier.end();
  return verifier.verify(opts.publicKeyPem, parsed.signature!, 'base64');
}
