import * as moment from 'moment';
import * as R from 'ramda';
import { isEmpty, round, sumBy } from 'lodash';
import { ERRORS, MatchedTransactionPOJO } from './types';
import { ServiceError } from '../Items/ServiceError';

export const sortClosestMatchTransactions = (
  amount: number,
  date: Date,
  matches: MatchedTransactionPOJO[],
) => {
  return R.sortWith([
    // Sort by amount difference (closest to uncategorized transaction amount first)
    R.ascend((match: MatchedTransactionPOJO) =>
      Math.abs(match.amount - amount),
    ),
    // Sort by date difference (closest to uncategorized transaction date first)
    R.ascend((match: MatchedTransactionPOJO) =>
      Math.abs(moment(match.date).diff(moment(date), 'days')),
    ),
  ])(matches);
};

export const sumMatchTranasctions = (transactions: Array<any>) => {
  const total = transactions.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    const multiplier = item.transactionNormal === 'debit' ? 1 : -1;
    return sum + multiplier * amount;
  }, 0);
  // Round to 2 decimal places to avoid floating-point precision issues
  return round(total, 2);
};

export const sumUncategorizedTransactions = (
  uncategorizedTransactions: Array<any>,
) => {
  const total = sumBy(uncategorizedTransactions, 'amount');
  // Round to 2 decimal places to avoid floating-point precision issues
  return round(total, 2);
};

export const validateUncategorizedTransactionsNotMatched = (
  uncategorizedTransactions: any,
) => {
  const matchedTransactions = uncategorizedTransactions.filter(
    (trans) => !isEmpty(trans.matchedBankTransactions),
  );
  //
  if (matchedTransactions.length > 0) {
    throw new ServiceError(ERRORS.TRANSACTION_ALREADY_MATCHED, '', {
      matchedTransactionsIds: matchedTransactions?.map((m) => m.id),
    });
  }
};

export const validateUncategorizedTransactionsExcluded = (
  uncategorizedTransactions: any,
) => {
  const excludedTransactions = uncategorizedTransactions.filter(
    (trans) => trans.excluded,
  );
  if (excludedTransactions.length > 0) {
    throw new ServiceError(ERRORS.CANNOT_MATCH_EXCLUDED_TRANSACTION, '', {
      excludedTransactionsIds: excludedTransactions.map((e) => e.id),
    });
  }
};

/**
 * Drops match-candidate rows whose `dueAmount` virtual is zero or
 * negative — i.e. fully paid / credited records that should not appear
 * in the matching panel.
 *
 * Done in JS, not SQL, because the previous raw-SQL modifier (`dueBills`
 * / `dueInvoices`) — a `WHERE COALESCE(AMOUNT,0) - COALESCE(PAYMENT_AMOUNT,0)
 * - COALESCE(CREDITED_AMOUNT,0) > 0` clause — silently failed when chained
 * with `withGraphJoined('matchedBankTransaction')`. The upstream
 * `PromisePool` in `GetMatchedTransactions` swallowed the per-task error,
 * leaving the candidate list empty (no 500, no log entry, just missing
 * rows). Filtering on the `dueAmount` virtual after the query sidesteps
 * the raw-SQL-meets-joined-graph trap entirely.
 *
 * The threshold is an ε (0.005), not `> 0`: `dueAmount` is `total -
 * balanceAmount`, and a fully-settled doc whose discount/payment legs
 * don't cancel to a clean zero in floating point leaves a residue
 * (~5.68e-14) that `> 0` would let through as a phantom "$0.00"
 * candidate (bit invoice 114, a discounted+fully-paid Square invoice,
 * UAT 2026-06-02). Same money-gate ε rule as commit a5893e40c.
 */
export const filterDueGreaterThanZero = <T extends { dueAmount: number }>(
  rows: T[],
): T[] => rows.filter((r) => Number(r.dueAmount) > 0.005);
