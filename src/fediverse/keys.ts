import { FediverseActorKey } from '../models/fediverse-actor-key.js';
import { generateRsaKeyPair } from './http-signature.js';

export interface ActorKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

/**
 * Return the blog actor keypair, generating and persisting one on first use.
 */
export async function ensureActorKeyPair(): Promise<ActorKeyPair> {
  const existing = await FediverseActorKey.query()
    .orderBy('id', 'asc')
    .firstModel();

  if (existing) {
    return {
      privateKeyPem: existing.getAttribute('private_key_pem') as string,
      publicKeyPem: existing.getAttribute('public_key_pem') as string,
    };
  }

  const generated = generateRsaKeyPair();
  const now = new Date().toISOString();
  await FediverseActorKey.create({
    private_key_pem: generated.privateKeyPem,
    public_key_pem: generated.publicKeyPem,
    created_at: now,
    updated_at: now,
  });

  return {
    privateKeyPem: generated.privateKeyPem,
    publicKeyPem: generated.publicKeyPem,
  };
}
