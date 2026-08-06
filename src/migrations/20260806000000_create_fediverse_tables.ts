import { Migration } from '@pondoknusa/database';
import type { DatabaseConnection } from '@pondoknusa/database';
import type { SchemaBuilder } from '@pondoknusa/database';

/**
 * Tables for the optional ActivityPub publisher.
 *
 * - `fediverse_actor_keys` — singleton RSA keypair for the blog actor
 * - `fediverse_followers` — remote actors that Follow'd this blog
 */
export default class CreateFediverseTables extends Migration {
  override async up(_connection: DatabaseConnection, schema: SchemaBuilder) {
    await schema.create('fediverse_actor_keys', (table) => {
      table.id();
      table.text('private_key_pem');
      table.text('public_key_pem');
      table.timestamps();
    });

    await schema.create('fediverse_followers', (table) => {
      table.id();
      table.string('actor_id', 512).unique();
      table.string('inbox_url', 512);
      table.string('shared_inbox_url', 512).nullable();
      table.timestamps();
    });
  }

  override async down(_connection: DatabaseConnection, schema: SchemaBuilder) {
    await schema.drop('fediverse_followers');
    await schema.drop('fediverse_actor_keys');
  }
}
