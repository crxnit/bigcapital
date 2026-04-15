/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('system_audit_logs', (table) => {
    table.bigIncrements('id');
    table.integer('user_id').unsigned().nullable();
    table.bigInteger('tenant_id').unsigned().nullable();
    table.string('action', 64).notNullable();
    table.string('resource_type', 64).nullable();
    table.string('resource_id', 64).nullable();
    table.json('metadata').nullable();
    table.string('ip', 45).nullable();
    table.string('user_agent', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('created_at', 'system_audit_logs_created_at_idx');
    table.index(['user_id', 'created_at'], 'system_audit_logs_user_created_idx');
    table.index(['action', 'created_at'], 'system_audit_logs_action_created_idx');
    table.index(['tenant_id', 'created_at'], 'system_audit_logs_tenant_created_idx');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('system_audit_logs');
};
