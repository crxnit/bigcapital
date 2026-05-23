import * as R from 'ramda';
import * as moment from 'moment';
import { first, sumBy } from 'lodash';
import { PromisePool } from '@supercharge/promise-pool';
import { Inject, Injectable } from '@nestjs/common';
import {
  GetMatchedTransactionsFilter,
  MatchedTransactionsPOJO,
} from '../types';
import { GetMatchedTransactionsByExpenses } from './GetMatchedTransactionsByExpenses';
import { GetMatchedTransactionsByBills } from './GetMatchedTransactionsByBills.service';
import { GetMatchedTransactionsByManualJournals } from './GetMatchedTransactionsByManualJournals.service';
import { GetMatchedTransactionsByCashflow } from './GetMatchedTransactionsByCashflow';
import { GetMatchedTransactionsByInvoices } from './GetMatchedTransactionsByInvoices.service';
import { UncategorizedBankTransaction } from '@/modules/BankingTransactions/models/UncategorizedBankTransaction';
import { sortClosestMatchTransactions } from '../_utils';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';

@Injectable()
export class GetMatchedTransactions {
  constructor(
    private readonly getMatchedInvoicesService: GetMatchedTransactionsByInvoices,
    private readonly getMatchedBillsService: GetMatchedTransactionsByBills,
    private readonly getMatchedManualJournalService: GetMatchedTransactionsByManualJournals,
    private readonly getMatchedExpensesService: GetMatchedTransactionsByExpenses,
    private readonly getMatchedCashflowService: GetMatchedTransactionsByCashflow,

    @Inject(UncategorizedBankTransaction.name)
    private readonly uncategorizedBankTransactionModel: TenantModelProxy<
      typeof UncategorizedBankTransaction
    >,
  ) {}

  /**
   * Registered matched transactions types.
   */
  get registered() {
    return [
      { type: 'SaleInvoice', service: this.getMatchedInvoicesService },
      { type: 'Bill', service: this.getMatchedBillsService },
      { type: 'Expense', service: this.getMatchedExpensesService },
      { type: 'ManualJournal', service: this.getMatchedManualJournalService },
      { type: 'Cashflow', service: this.getMatchedCashflowService },
    ];
  }

  /**
   * Retrieves the matched transactions.
   * @param {Array<number>} uncategorizedTransactionIds - Uncategorized transactions ids.
   * @param {GetMatchedTransactionsFilter} filter -
   * @returns {Promise<MatchedTransactionsPOJO>}
   */
  public async getMatchedTransactions(
    uncategorizedTransactionIds: Array<number>,
    filter: GetMatchedTransactionsFilter,
  ): Promise<MatchedTransactionsPOJO> {
    const uncategorizedTransactions =
      await this.uncategorizedBankTransactionModel()
        .query()
        .whereIn('id', uncategorizedTransactionIds)
        .throwIfNotFound();

    const totalPending = sumBy(uncategorizedTransactions, 'amount');

    // Direction-aware candidate filter. A withdrawal (money out — bank
    // transaction with negative amount, e.g. a credit-card charge) can
    // only match outflow-side records (Bills, Expenses); a deposit (money
    // in) can only match inflow-side records (SaleInvoices). Cashflow
    // (transfers) and ManualJournal flow either way. Without this, the
    // matching panel showed e.g. SaleInvoices as candidates for a credit-
    // card charge.
    //
    // Precondition: all uncategorized transactions in the group are
    // assumed to share a sign (the matching UI already enforces this by
    // disabling cross-direction multi-select). We infer direction from
    // the first row; a mixed batch would silently get filtered to one
    // side's candidates. If the UI ever permits mixed batches, replace
    // this with `uncategorizedTransactions.every(t => Math.sign(t.amount)
    // === Math.sign(first.amount))` and throw on mismatch.
    //
    // A zero-amount transaction (neither withdrawal nor deposit) falls
    // through to "all types allowed" — the most permissive default and
    // the same behaviour the code had before this guard was documented.
    const firstUnc = first(uncategorizedTransactions);
    const txAmount = Number(firstUnc?.amount ?? 0);
    const isWithdrawal = txAmount < 0;
    const isDeposit = txAmount > 0;
    const directionAllowed = (type: string): boolean => {
      if (!isWithdrawal && !isDeposit) return true;
      if (type === 'SaleInvoice') return !isWithdrawal;
      if (type === 'Bill' || type === 'Expense') return !isDeposit;
      return true;
    };

    const filtered = filter.transactionType
      ? this.registered.filter((item) => item.type === filter.transactionType)
      : this.registered.filter((item) => directionAllowed(item.type));

    // All uncategorized transactions being matched together live on the same
    // bank account (same ledger being reconciled). Propagate that account id
    // so type-specific queries can narrow candidates — e.g. expense splits
    // are filtered to splits drawn from this account.
    const paymentAccountId =
      filter.paymentAccountId ?? first(uncategorizedTransactions)?.accountId;
    const scopedFilter = { ...filter, paymentAccountId };

    const matchedTransactions = await PromisePool.withConcurrency(2)
      .for(filtered)
      .process(async ({ type, service }) => {
        return service.getMatchedTransactions(scopedFilter);
      });
    const { perfectMatches, possibleMatches } = this.groupMatchedResults(
      uncategorizedTransactions,
      matchedTransactions,
    );
    return {
      perfectMatches,
      possibleMatches,
      totalPending,
    };
  }

  /**
   * Groups the given results for getting perfect and possible matches
   * based on the given uncategorized transaction.
   * @param uncategorizedTransaction
   * @param matchedTransactions
   * @returns {MatchedTransactionsPOJO}
   */
  private groupMatchedResults(
    uncategorizedTransactions: Array<any>,
    matchedTransactions,
  ): MatchedTransactionsPOJO {
    const results = R.compose(R.flatten)(matchedTransactions?.results);

    const firstUncategorized = first(uncategorizedTransactions);
    const amount = sumBy(uncategorizedTransactions, 'amount');
    const date = firstUncategorized.date;

    // Sort the results based on amount, date, and transaction type
    const closestResullts = sortClosestMatchTransactions(amount, date, results);
    const perfectMatches = R.filter(
      (match) =>
        match.amount === amount && moment(match.date).isSame(date, 'day'),
      closestResullts,
    );
    const possibleMatches = R.difference(closestResullts, perfectMatches);
    const totalPending = sumBy(uncategorizedTransactions, 'amount');

    return { perfectMatches, possibleMatches, totalPending };
  }
}
