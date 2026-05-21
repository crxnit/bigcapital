/**
 * Parallel table for direct-account allocations on sale invoices, mirroring
 * the bill_expense_categories pattern but on the revenue side. Lets an
 * invoice carry both itemized lines (existing `items_entries`) and a list
 * of direct income-account allocations summing into the same invoice total.
 *
 * GL direction is reversed vs. bills (one CR per row against the chosen
 * income account); accounts receivable still picks up the combined total
 * because `sales_invoices.balance` is sumed as itemsTotal + categoriesTotal
 * in the DTO transformer.
 *
 * Per CLAUDE.md the fork uses service-side cascade (explicit `.delete()`
 * under the parent UoW transaction) rather than DB-level ON DELETE CASCADE,
 * so the FK here is intentionally without onDelete.
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('sale_invoice_income_categories', (table) => {
      table.increments();
      table
        .integer('sale_invoice_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('sales_invoices');
      table
        .integer('income_account_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('accounts');
      table.integer('index').unsigned();
      table.text('description');
      table.decimal('amount', 13, 3);
      table.timestamps();
    })
    .raw('ALTER TABLE `SALE_INVOICE_INCOME_CATEGORIES` AUTO_INCREMENT = 1000');
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('sale_invoice_income_categories');
};
