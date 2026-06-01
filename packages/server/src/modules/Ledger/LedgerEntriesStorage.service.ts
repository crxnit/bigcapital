import { Knex } from 'knex';
import { uniq } from 'lodash';
import { Inject, Injectable } from '@nestjs/common';
import { transformLedgerEntryToTransaction } from './utils';
import { ILedgerEntry } from './types/Ledger.types';
import { ILedger } from './types/Ledger.types';
import { AccountTransaction } from '../Accounts/models/AccountTransaction.model';
import { Account } from '../Accounts/models/Account.model';
import { TenantModelProxy } from '../System/models/TenantBaseModel';
import { ServiceError } from '../Items/ServiceError';
import { ERRORS } from '../Accounts/constants';

// Filter the blank entries.
const filterBlankEntry = (entry: ILedgerEntry) =>
  Boolean(entry.credit || entry.debit);

@Injectable()
export class LedgerEntriesStorageService {
  /**
   * @param {TenantModelProxy<typeof AccountTransaction>} accountTransactionModel - Account transaction model.
   * @param {TenantModelProxy<typeof Account>} accountModel - Account model.
   */
  constructor(
    @Inject(AccountTransaction.name)
    private readonly accountTransactionModel: TenantModelProxy<
      typeof AccountTransaction
    >,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
  ) {}

  /**
   * Saves entries of the given ledger.
   * @param {ILedger} ledger - Ledger.
   * @param {Knex.Transaction} trx - Knex transaction.
   * @returns {Promise<void>}
   */
  public saveEntries = async (ledger: ILedger, trx?: Knex.Transaction) => {
    const filtered = ledger.filter(filterBlankEntry);
    const entries = filtered.getEntries();

    // Reject postings to parent accounts. Parent accounts (any account that
    // has children pointing at it via `parent_account_id`) are grouping /
    // subtotal nodes in the Chart of Accounts — their report balance is the
    // roll-up of their children. Posting GL directly to a parent mixes a
    // direct amount into that subtotal and breaks the hierarchy as a clean
    // sum. Every GL write in the app funnels through here, so this one guard
    // covers all posting paths (invoices, bills, expenses, manual journals,
    // bank categorization, Square, etc.).
    await this.assertNoParentAccountPostings(filtered, trx);

    // Sequential await: Knex transactions are not safe for concurrent
    // queries on the same trx, and the prior `async.queue` (concurrency 10)
    // silently swallowed per-entry insert failures via the queue's
    // unhandled-error path — leaving the A/R debit + most credits in place
    // while one or more credit legs vanished. That produced unbalanced
    // SaleInvoice GL transactions that only surfaced via Trial Balance.
    for (const entry of entries) {
      await this.saveEntry(entry, trx);
    }
  };

  /**
   * Deletes the ledger entries.
   * @param {ILedger} ledger - Ledger.
   * @param {Knex.Transaction} trx - Knex transaction.
   */
  public deleteEntries = async (ledger: ILedger, trx?: Knex.Transaction) => {
    const entriesIds = ledger
      .getEntries()
      .filter((e) => e.entryId)
      .map((e) => e.entryId);

    await this.accountTransactionModel()
      .query(trx)
      .whereIn('id', entriesIds)
      .delete();
  };

  /**
   * Asserts that none of the accounts the ledger posts to is a parent account
   * (i.e. has child accounts). Throws a `ServiceError` naming the offending
   * accounts so the failure surfaces in the form's `onError` handler.
   * @param {ILedger} ledger - Ledger (blank entries already filtered out).
   * @param {Knex.Transaction} trx - Knex transaction.
   * @returns {Promise<void>}
   */
  private assertNoParentAccountPostings = async (
    ledger: ILedger,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    const accountsIds = uniq(ledger.getAccountsIds().filter(Boolean));

    if (accountsIds.length === 0) {
      return;
    }
    // An account is a "parent" iff some other account points at it via
    // `parent_account_id`. Find which of the posted-to accounts are parents.
    const childRows = await this.accountModel()
      .query(trx)
      .whereIn('parentAccountId', accountsIds)
      .distinct('parentAccountId');
    const parentAccountsIds = childRows.map((row) => row.parentAccountId);

    if (parentAccountsIds.length === 0) {
      return;
    }
    const parentAccounts = await this.accountModel()
      .query(trx)
      .whereIn('id', parentAccountsIds);
    const names = parentAccounts
      .map((account) => `"${account.name}"`)
      .join(', ');

    throw new ServiceError(
      ERRORS.POSTING_TO_PARENT_ACCOUNT_NOT_ALLOWED,
      `Cannot post transactions to parent account(s): ${names}. ` +
        `Parent accounts are grouping headers — post to a child account instead.`,
      { parentAccountsIds },
    );
  };

  /**
   * Saves the ledger entry to the account transactions repository.
   * @param {ILedgerEntry} entry - Ledger entry.
   * @param {Knex.Transaction} trx
   * @returns {Promise<void>}
   */
  private saveEntry = async (
    entry: ILedgerEntry,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    const transaction = transformLedgerEntryToTransaction(entry);

    await this.accountTransactionModel().query(trx).insert(transaction);
  };
}
