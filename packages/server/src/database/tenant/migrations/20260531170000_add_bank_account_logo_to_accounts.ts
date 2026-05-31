/**
 * Adds per-account logo columns so the cashflow-accounts cards can show a bank
 * brand logo alongside the colored type badge.
 *
 * Two mutually-exclusive sources (the UI only ever sets one; `slug` wins if both
 * are somehow present):
 *  - `bank_account_logo_slug`: id of a bundled library logo (resolved to a
 *    static asset client-side).
 *  - `bank_account_logo_key`: attachment key of a custom uploaded image
 *    (resolved to a presigned/proxied URL server-side, like the org logo).
 *
 * Both null/empty for accounts without a logo.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('accounts', (table) => {
    table.string('bank_account_logo_slug', 100).nullable();
    table.string('bank_account_logo_key', 255).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('bank_account_logo_slug');
    table.dropColumn('bank_account_logo_key');
  });
};
