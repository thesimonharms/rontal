import { Model } from '@pondoknusa/database';

export interface FediverseActorKeyAttributes {
  id: number;
  private_key_pem: string;
  public_key_pem: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export class FediverseActorKey extends Model<FediverseActorKeyAttributes> {
  static override table = 'fediverse_actor_keys';
}
