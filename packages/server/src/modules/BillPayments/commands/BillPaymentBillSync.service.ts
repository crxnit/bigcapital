import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { Bill } from '../../Bills/models/Bill';
import { entriesAmountDiff } from '@/utils/entries-amount-diff';
import { ModelObject } from 'objection';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { BillPaymentEntryDto } from '../dtos/BillPayment.dto';
import { BillPaymentEntry } from '../models/BillPaymentEntry';

@Injectable()
export class BillPaymentBillSync {
  constructor(
    @Inject(Bill.name)
    private readonly bill: TenantModelProxy<typeof Bill>,
  ) {}

  /**
   * Saves bills payment amount changes different.
   * @param {number} tenantId -
   * @param {IBillPaymentEntryDTO[]} paymentMadeEntries -
   * @param {IBillPaymentEntryDTO[]} oldPaymentMadeEntries -
   */
  public async saveChangeBillsPaymentAmount(
    paymentMadeEntries: BillPaymentEntryDto[],
    oldPaymentMadeEntries?: ModelObject<BillPaymentEntry>[],
    trx?: Knex.Transaction,
  ): Promise<void> {
    const diffEntries = entriesAmountDiff(
      paymentMadeEntries,
      oldPaymentMadeEntries,
      'paymentAmount',
      'billId',
    );
    // Run sequentially — `trx` is not concurrency-safe; parallel writes on a
    // single Knex transaction give non-deterministic per-row failures.
    for (const diffEntry of diffEntries as Array<{
      paymentAmount: number;
      billId: number;
    }>) {
      if (diffEntry.paymentAmount === 0) {
        continue;
      }
      await this.bill().changePaymentAmount(
        diffEntry.billId,
        diffEntry.paymentAmount,
        trx,
      );
    }
  }
}
