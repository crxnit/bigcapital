/**
 * Parallel table for direct-account allocations on credit notes, mirroring
 * the sale_invoice_income_categories pattern on the customer-credit side.
 * A credit note can carry both itemized lines (existing `items_entries`)
 * and a list of direct income-account allocations summing into the same
 * credit-note total.
 *
 * GL direction is reversed vs. SaleInvoice (one DR per row against the
 * chosen income account; the original invoice CR'd income, the credit
 * note debits it to reverse). A/R still picks up the combined total
 * because `credit_notes.amount` is summed as itemsTotal + categoriesTotal
 * in the DTO transformer.
 *
 * Per CLAUDE.md the fork uses service-side cascade (explicit `.delete()`
 * under the parent UoW transaction) rather than DB-level ON DELETE CASCADE,
 * so the FK here is intentionally without onDelete.
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('credit_note_income_categories', (table) => {
      table.increments();
      table
        .integer('credit_note_id')
        .unsigned()
        .index()
        .references('id')
        .inTable('credit_notes');
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
    .raw('ALTER TABLE `CREDIT_NOTE_INCOME_CATEGORIES` AUTO_INCREMENT = 1000');
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('credit_note_income_categories');
};
