/**
 * Parallel table for direct-account allocations on bills, mirroring the
 * Expense form's `expense_transaction_categories` pattern. Lets a vendor bill
 * carry both itemized lines (existing `items_entries`) and a list of direct
 * expense-account allocations summing into the same bill total.
 *
 * Per CLAUDE.md the fork uses service-side cascade (explicit `.delete()`
 * under the parent UoW transaction) rather than DB-level ON DELETE CASCADE,
 * so the FK here is intentionally without onDelete.
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('bill_expense_categories', (table) => {
      table.increments();
      table
        .integer('bill_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('bills');
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
    .raw('ALTER TABLE `BILL_EXPENSE_CATEGORIES` AUTO_INCREMENT = 1000');
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('bill_expense_categories');
};
