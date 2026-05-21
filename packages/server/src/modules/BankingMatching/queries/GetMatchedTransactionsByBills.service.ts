import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { first } from 'lodash';
import { GetMatchedTransactionBillsTransformer } from './GetMatchedTransactionBillsTransformer';
import {
  GetMatchedTransactionsFilter,
  IMatchTransactionDTO,
  MatchedTransactionPOJO,
} from '../types';
import { GetMatchedTransactionsByType } from './GetMatchedTransactionsByType';
import { CreateBillPaymentService } from '@/modules/BillPayments/commands/CreateBillPayment.service';
import { TransformerInjectable } from '@/modules/Transformer/TransformerInjectable.service';
import { Bill } from '@/modules/Bills/models/Bill';
import { UncategorizedBankTransaction } from '@/modules/BankingTransactions/models/UncategorizedBankTransaction';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { CreateBillPaymentDto } from '@/modules/BillPayments/dtos/BillPayment.dto';

@Injectable()
export class GetMatchedTransactionsByBills extends GetMatchedTransactionsByType {
  constructor(
    private readonly createPaymentMadeService: CreateBillPaymentService,
    private readonly transformer: TransformerInjectable,

    @Inject(Bill.name)
    private readonly billModel: TenantModelProxy<typeof Bill>,

    @Inject(UncategorizedBankTransaction.name)
    private readonly uncategorizedBankTransactionModel: TenantModelProxy<
      typeof UncategorizedBankTransaction
    >,
  ) {
    super();
  }

  /**
   * Retrieves the matched transactions.
   * @param {number} tenantId -
   * @param {GetMatchedTransactionsFilter} filter -
   */
  public async getMatchedTransactions(filter: GetMatchedTransactionsFilter) {
    // Retrieves the published, not-yet-matched bills.
    //
    // Note: the previous version of this query chained `q.modify('dueBills')`
    // (a raw-SQL WHERE on `COALESCE(AMOUNT,0)-COALESCE(PAYMENT_AMOUNT,0)-
    // COALESCE(CREDITED_AMOUNT,0)>0`). Combined with `withGraphJoined`, that
    // raw expression silently failed and the upstream `PromisePool` in
    // `GetMatchedTransactions` swallowed the per-task error — leaving the
    // bills service returning zero rows (no 500, just an empty candidate
    // list). Filter on the `dueAmount` virtual in JS to sidestep the trap.
    const bills = await this.billModel()
      .query()
      .onBuild((q) => {
        q.withGraphJoined('matchedBankTransaction');
        q.whereNull('matchedBankTransaction.id');
        q.modify('published');

        if (filter.fromDate) {
          q.where('billDate', '>=', filter.fromDate);
        }
        if (filter.toDate) {
          q.where('billDate', '<=', filter.toDate);
        }
        q.orderBy('billDate', 'DESC');
      });

    const billsWithDue = bills.filter((b) => Number(b.dueAmount) > 0);

    return this.transformer.transform(
      billsWithDue,
      new GetMatchedTransactionBillsTransformer(),
    );
  }

  /**
   * Retrieves the given bill matched transaction.
   * @param {number} tenantId
   * @param {number} transactionId
   * @returns {Promise<MatchedTransactionPOJO>}
   */
  public async getMatchedTransaction(
    transactionId: number,
  ): Promise<MatchedTransactionPOJO> {
    const bill = await this.billModel()
      .query()
      .findById(transactionId)
      .throwIfNotFound();

    return this.transformer.transform(
      bill,
      new GetMatchedTransactionBillsTransformer(),
    );
  }

  /**
   * Creates the common matched transaction.
   * @param {number} tenantId
   * @param {Array<number>} uncategorizedTransactionIds
   * @param {IMatchTransactionDTO} matchTransactionDTO
   * @param {Knex.Transaction} trx
   */
  public async createMatchedTransaction(
    uncategorizedTransactionIds: Array<number>,
    matchTransactionDTO: IMatchTransactionDTO,
    trx?: Knex.Transaction,
  ): Promise<void> {
    await super.createMatchedTransaction(
      uncategorizedTransactionIds,
      matchTransactionDTO,
      trx,
    );
    const uncategorizedTransactionId = first(uncategorizedTransactionIds);
    const uncategorizedTransaction =
      await this.uncategorizedBankTransactionModel()
        .query(trx)
        .findById(uncategorizedTransactionId)
        .throwIfNotFound();

    const bill = await this.billModel()
      .query(trx)
      .findById(matchTransactionDTO.referenceId)
      .throwIfNotFound();

    const createPaymentMadeDTO: CreateBillPaymentDto = {
      vendorId: bill.vendorId,
      paymentAccountId: uncategorizedTransaction.accountId,
      paymentDate: uncategorizedTransaction.date,
      exchangeRate: 1,
      entries: [
        {
          paymentAmount: bill.dueAmount,
          billId: bill.id,
        },
      ],
      branchId: bill.branchId,
    };
    // Create a new bill payment associated to the matched bill.
    const billPayment = await this.createPaymentMadeService.createBillPayment(
      createPaymentMadeDTO,
      trx,
    );
    // Link the create bill payment with matched transaction.
    await super.createMatchedTransaction(
      uncategorizedTransactionIds,
      {
        referenceType: 'BillPayment',
        referenceId: billPayment.id,
      },
      trx,
    );
  }
}
