import * as R from 'ramda';
import * as moment from 'moment';
import { first, isEmpty } from 'lodash';
import {
  ICashflowAccountTransaction,
  ICashflowAccountTransactionsQuery,
} from '../../types/BankingTransactions.types';
import { BankTransactionStatus } from './_constants';
import { FinancialSheet } from '@/modules/FinancialStatements/common/FinancialSheet';
import { formatBankTransactionsStatus } from './_utils';
import { GetBankAccountTransactionsRepository } from './GetBankAccountTransactionsRepo.service';
import { runningBalance } from '@/utils/running-balance';
import { I18nService } from 'nestjs-i18n';

export class GetBankAccountTransactions extends FinancialSheet {
  private runningBalance: any;
  private query: ICashflowAccountTransactionsQuery;
  private repo: GetBankAccountTransactionsRepository;
  private i18n: I18nService;

  /**
   * Constructor method.
   * @param {IAccountTransaction[]} transactions -
   * @param {number} openingBalance -
   * @param {ICashflowAccountTransactionsQuery} query -
   * @param {string} dateFormat - The date format from organization settings.
   */
  constructor(
    repo: GetBankAccountTransactionsRepository,
    query: ICashflowAccountTransactionsQuery,
    i18n: I18nService,
    dateFormat?: string,
  ) {
    super();

    this.repo = repo;
    this.query = query;
    this.i18n = i18n;
    this.dateFormat = dateFormat || this.dateFormat;

    this.runningBalance = runningBalance(this.repo.openingBalance);
  }

  /**
   * Retrieves the transaction status.
   * @param {} transaction
   * @returns {BankTransactionStatus}
   */
  private getTransactionStatus(transaction: any): BankTransactionStatus {
    const categorizedTrans = this.repo.uncategorizedTransactionsMapByRef.get(
      `${transaction.referenceType}-${transaction.referenceId}`,
    );
    const matchedTrans = this.repo.matchedBankTransactionsMapByRef.get(
      `${transaction.referenceType}-${transaction.referenceId}`,
    );
    if (!isEmpty(categorizedTrans)) {
      return BankTransactionStatus.Categorized;
    } else if (!isEmpty(matchedTrans)) {
      return BankTransactionStatus.Matched;
    } else {
      return BankTransactionStatus.Manual;
    }
  }

  /**
   * Retrieves the uncategoized transaction id from the given transaction.
   * @param transaction
   * @returns {number|null}
   */
  private getUncategorizedTransId(transaction: any): number {
    // The given transaction would be categorized, matched or not, so we'd take a look at
    // the categorized transaction first to get the id if not exist, then should look at the matched
    // transaction if not exist too, so the given transaction has no uncategorized transaction id.
    const categorizedTrans = this.repo.uncategorizedTransactionsMapByRef.get(
      `${transaction.referenceType}-${transaction.referenceId}`,
    );
    const matchedTrans = this.repo.matchedBankTransactionsMapByRef.get(
      `${transaction.referenceType}-${transaction.referenceId}`,
    );
    // Relation between the transaction and matching always been one-to-one.
    const firstCategorizedTrans = first(categorizedTrans);
    const firstMatchedTrans = first(matchedTrans);

    return (
      firstCategorizedTrans?.id ||
      firstMatchedTrans?.uncategorizedTransactionId ||
      null
    );
  }

  /**
   *Transformes the account transaction to to cashflow transaction node.
   * @param {IAccountTransaction} transaction
   * @returns {ICashflowAccountTransaction}
   */
  private transactionNode = (transaction: any): ICashflowAccountTransaction => {
    const status = this.getTransactionStatus(transaction);
    const uncategorizedTransactionId =
      this.getUncategorizedTransId(transaction);

    return {
      id: transaction.id,
      createdAt: transaction.createdAt,

      date: transaction.date,
      formattedDate: this.getDateFormatted(transaction.date),

      withdrawal: transaction.credit,
      deposit: transaction.debit,

      formattedDeposit: this.formatNumber(transaction.debit),
      formattedWithdrawal: this.formatNumber(transaction.credit),

      referenceId: transaction.referenceId,
      referenceType: transaction.referenceType,

      formattedTransactionType: this.i18n.t(transaction.referenceTypeFormatted),

      transactionNumber: transaction.transactionNumber,
      referenceNumber: transaction.referenceNumber,

      runningBalance: this.runningBalance.amount(),
      formattedRunningBalance: this.formatNumber(this.runningBalance.amount()),

      balance: 0,
      formattedBalance: '',
      status,
      formattedStatus: formatBankTransactionsStatus(status),
      uncategorizedTransactionId,
    };
  };

  /**
   * Associate cashflow transaction node with running balance attribute.
   * @param {IAccountTransaction} transaction
   * @returns {ICashflowAccountTransaction}
   */
  private transactionRunningBalance = (
    transaction: ICashflowAccountTransaction,
  ): ICashflowAccountTransaction => {
    // Transactions are walked oldest -> newest from the balance before this
    // page's oldest row (the opening balance). Apply this row's amount first so
    // the accumulator equals the balance AFTER this transaction, then capture
    // it — the next (newer) iteration carries on from here.
    const amount = transaction.deposit - transaction.withdrawal;
    if (amount > 0) this.runningBalance.increment(amount);
    else if (amount < 0) this.runningBalance.decrement(-amount);

    const runningBalance = this.runningBalance.amount();

    return {
      ...transaction,
      runningBalance,
      formattedRunningBalance: this.formatNumber(runningBalance),
    };
  };

  /**
   * Associate to balance attribute to cashflow transaction node.
   * @param {ICashflowAccountTransaction} transaction
   * @returns {ICashflowAccountTransaction}
   */
  private transactionBalance = (
    transaction: ICashflowAccountTransaction,
  ): ICashflowAccountTransaction => {
    return {
      ...transaction,
      balance: transaction.runningBalance,
      formattedBalance: transaction.formattedRunningBalance,
    };
  };

  /**
   * Transformes the given account transaction to cashflow report transaction.
   * @param {ICashflowAccountTransaction} transaction
   * @returns {ICashflowAccountTransaction}
   */
  private transactionTransformer = (
    transaction,
  ): ICashflowAccountTransaction => {
    return R.compose(
      this.transactionBalance,
      this.transactionRunningBalance,
      this.transactionNode,
    )(transaction);
  };

  /**
   * Retrieve the report transactions node.
   * @param {} transactions
   * @returns {ICashflowAccountTransaction[]}
   */
  private transactionsNode = (
    transactions: any[],
  ): ICashflowAccountTransaction[] => {
    return R.map(this.transactionTransformer)(transactions);
  };

  /**
   * Retrieve the reprot data node.
   * @returns {ICashflowAccountTransaction[]}
   */
  public reportData(): ICashflowAccountTransaction[] {
    return this.transactionsNode(this.repo.transactions);
  }
}
