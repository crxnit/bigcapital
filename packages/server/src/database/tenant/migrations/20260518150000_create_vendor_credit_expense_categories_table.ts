/**
 * Parallel table for direct-account allocations on vendor credits, mirroring
 * the bill_expense_categories pattern shipped in commit 16c5e16b6. Lets a
 * vendor credit carry both itemized lines (existing items_entries) and a
 * list of direct expense-account allocations summing into the same credit
 * total.
 *
 * Per CLAUDE.md the fork uses service-side cascade (explicit `.delete()`
 * under the parent UoW transaction) rather than DB-level ON DELETE CASCADE,
 * so the FK here is intentionally without onDelete.
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('vendor_credit_expense_categories', (table) => {
      table.increments();
      table
        .integer('vendor_credit_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('vendor_credits');
      table
        .integer('expense_account_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('accounts');
      table.integer('index').unsigned();
      table.text('description');
      table.decimal('amount', 13, 3);
      table.timestamps();
    })
    .raw(
      'ALTER TABLE `VENDOR_CREDIT_EXPENSE_CATEGORIES` AUTO_INCREMENT = 1000',
    );
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('vendor_credit_expense_categories');
};
