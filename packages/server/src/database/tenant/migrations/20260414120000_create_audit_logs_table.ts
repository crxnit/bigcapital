import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.bigIncrements('id');
    table.integer('user_id').unsigned().nullable();
    table.string('action', 64).notNullable();
    table.string('resource_type', 64).nullable();
    table.string('resource_id', 64).nullable();
    table.json('metadata').nullable();
    table.string('ip', 45).nullable();
    table.string('user_agent', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('created_at', 'audit_logs_created_at_idx');
    table.index(['user_id', 'created_at'], 'audit_logs_user_created_idx');
    table.index(['action', 'created_at'], 'audit_logs_action_created_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
