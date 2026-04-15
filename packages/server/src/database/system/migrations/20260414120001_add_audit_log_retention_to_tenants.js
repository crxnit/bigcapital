/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tenants', (table) => {
    // Per-tenant audit-log retention override (days). NULL = use global default.
    table.integer('audit_log_retention_days').unsigned().nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('tenants', (table) => {
    table.dropColumn('audit_log_retention_days');
  });
};
