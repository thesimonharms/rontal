import { Migration } from '@pondoknusa/database';
import type { DatabaseConnection } from '@pondoknusa/database';
import type { SchemaBuilder } from '@pondoknusa/database';

export default class CreatePostsTable extends Migration {
  override async up(_connection: DatabaseConnection, schema: SchemaBuilder) {
    await schema.create('posts', (table) => {
      table.id();
      table.string('title');
      table.string('slug');
      table.text('body');
      table.string('excerpt').nullable();
      table.string('published_at').nullable();
      table.timestamps();
    });
  }

  override async down(_connection: DatabaseConnection, schema: SchemaBuilder) {
    await schema.drop('posts');
  }
}
