import { Model } from '@pondoknusa/database';

export interface FediverseFollowerAttributes {
  id: number;
  actor_id: string;
  inbox_url: string;
  shared_inbox_url: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export class FediverseFollower extends Model<FediverseFollowerAttributes> {
  static override table = 'fediverse_followers';
}
