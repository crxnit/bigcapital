/**
 * Adds a nullable `bank_account_subtype` to accounts so the cashflow-accounts
 * cards can be grouped into Checking / Savings / (other) Bank sections.
 *
 * Only meaningful for `bank`-type accounts; null/empty for everything else.
 * Values: 'checking' | 'savings' | 'other' | null. Existing bank accounts have
 * null until edited, so they render under the catch-all "Bank Accounts" section.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('accounts', (table) => {
    table.string('bank_account_subtype', 50).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('bank_account_subtype');
  });
};
