import { Knex } from 'knex';
import { Inject, Injectable } from '@nestjs/common';
import { ILedger } from './types/Ledger.types';
import { LedgerContactsBalanceStorage } from './LedgerContactStorage.service';
import { LedegrAccountsStorage } from './LedgetAccountStorage.service';
import { LedgerEntriesStorageService } from './LedgerEntriesStorage.service';
import { AccountTransaction } from '../Accounts/models/AccountTransaction.model';
import { Ledger } from './Ledger';
import { TenantModelProxy } from '../System/models/TenantBaseModel';

@Injectable()
export class LedgerStorageService {
  /**
   * @param {LedgerContactsBalanceStorage} ledgerContactsBalance - Ledger contacts balance storage.
   * @param {LedegrAccountsStorage} ledgerAccountsBalance - Ledger accounts balance storage.
   * @param {LedgerEntriesStorageService} ledgerEntriesService - Ledger entries storage service.
   */
  constructor(
    private ledgerContactsBalance: LedgerContactsBalanceStorage,
    private ledgerAccountsBalance: LedegrAccountsStorage,
    private ledgerEntriesService: LedgerEntriesStorageService,

    @Inject(AccountTransaction.name)
    private accountTransactionModel: TenantModelProxy<
      typeof AccountTransaction
    >,
  ) {}

  /**
   * Commit the ledger to the storage layer as one unit-of-work.
   *
   * Sequential, not parallel: Knex transactions are not concurrency-safe.
   * Running these three writers via `Promise.all` raced the entries
   * inserts against the accounts/contacts balance updates on the same
   * trx; collisions raised mysql2 transient errors that the @nestjs/
   * event-emitter swallowed in the subscriber wrapper — committing the
   * A/R debit while silently dropping per-item credit legs. Surfaced as
   * a trial-balance break on staging SaleInvoice 114.
   * @param {ILedger} ledger
   * @returns {Promise<void>}
   */
  public commit = async (
    ledger: ILedger,
    trx?: Knex.Transaction,
  ): Promise<void> => {
    // Saves the ledger entries.
    await this.ledgerEntriesService.saveEntries(ledger, trx);

    // Mutates the associated accounts balances.
    await this.ledgerAccountsBalance.saveAccountsBalance(ledger, trx);

    // Mutates the associated contacts balances.
    await this.ledgerContactsBalance.saveContactsBalance(ledger, trx);
  };

  /**
   * Deletes the given ledger and revert balances.
   *
   * Sequential for the same reason as `commit` above.
   * @param {number} tenantId
   * @param {ILedger} ledger
   * @param {Knex.Transaction} trx
   * @returns {Promise<void>}
   */
  public delete = async (ledger: ILedger, trx?: Knex.Transaction) => {
    // Deletes the ledger entries.
    await this.ledgerEntriesService.deleteEntries(ledger, trx);

    // Mutates the associated accounts balances.
    await this.ledgerAccountsBalance.saveAccountsBalance(ledger, trx);

    // Mutates the associated contacts balances.
    await this.ledgerContactsBalance.saveContactsBalance(ledger, trx);
  };

  /**
   * Deletes the ledger entries by the given reference.
   * @param {number | number[]} referenceId - The reference ID.
   * @param {string | string[]} referenceType - The reference type.
   * @param {Knex.Transaction} trx - The knex transaction.
   */
  public deleteByReference = async (
    referenceId: number | number[],
    referenceType: string | string[],
    trx?: Knex.Transaction,
  ) => {
    // Retrieves the transactions of the given reference.
    const transactions = await this.accountTransactionModel()
      .query(trx)
      .modify('filterByReference', referenceId, referenceType)
      .withGraphFetched('account');

    // Creates a new ledger from transaction and reverse the entries.
    const reversedLedger = Ledger.fromTransactions(transactions).reverse();

    // Deletes and reverts the balances.
    await this.delete(reversedLedger, trx);
  };
}
