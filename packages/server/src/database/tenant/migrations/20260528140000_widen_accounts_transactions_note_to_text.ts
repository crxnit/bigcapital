/**
 * Widen ACCOUNTS_TRANSACTIONS.NOTE from varchar(255) to TEXT.
 *
 * Root cause for SaleInvoice 114's lost GL credit legs on staging
 * (trial-balance break $334.59): the GL writer copies
 * ItemEntry.description into each item's ledger-entry `note`, but item
 * descriptions are stored as TEXT and can be much longer than 255 chars
 * (e.g. catering line items with multi-line topping / ingredient lists).
 * The INSERT for the first long-noted credit leg threw
 * ER_DATA_TOO_LONG; the for-await loop in LedgerEntriesStorageService
 * bailed, propagating the error up to the @OnEvent handler where
 * @nestjs/event-emitter wraps subscribers in try/catch and only logs
 * (`EventSubscribersLoader.wrapFunctionInTryCatchBlocks`). The
 * UnitOfWork therefore committed the AR debit while every per-item
 * credit leg vanished silently — surfaced only via the trial-balance
 * audit, $361.81 imbalance on staging.
 *
 * Affects every transaction type whose GL writer copies an item entry's
 * description into the ledger note (sale invoices, bills, credit notes,
 * vendor credits, sale receipts, …). Widening the destination column to
 * TEXT removes the truncation footgun for all of them.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('accounts_transactions', (table) => {
    table.text('note').alter();
  });
};

exports.down = function (knex) {
  // Rollback truncates any notes longer than 255 chars — accept the
  // data loss in exchange for symmetry; the trial-balance bug returns
  // if this is ever applied.
  return knex.schema.alterTable('accounts_transactions', (table) => {
    table.string('note', 255).alter();
  });
};
