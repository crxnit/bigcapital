import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { SaleInvoice } from '../../SaleInvoices/models/SaleInvoice';
import { IPaymentReceivedEntryDTO } from '../types/PaymentReceived.types';
import { entriesAmountDiff } from '@/utils/entries-amount-diff';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';

@Injectable()
export class PaymentReceivedInvoiceSync {
  constructor(
    @Inject(SaleInvoice.name)
    private readonly saleInvoiceModel: TenantModelProxy<typeof SaleInvoice>,
  ) {}

  /**
   * Saves difference changing between old and new invoice payment amount.
   * @param {Array} paymentReceiveEntries
   * @param {Array} newPaymentReceiveEntries
   * @return {Promise<void>}
   */
  public async saveChangeInvoicePaymentAmount(
    newPaymentReceiveEntries: IPaymentReceivedEntryDTO[],
    oldPaymentReceiveEntries?: IPaymentReceivedEntryDTO[],
    trx?: Knex.Transaction,
  ): Promise<void> {
    const diffEntries = entriesAmountDiff(
      newPaymentReceiveEntries,
      oldPaymentReceiveEntries,
      'paymentAmount',
      'invoiceId',
    );
    // Run sequentially — `trx` is not concurrency-safe; parallel writes on a
    // single Knex transaction give non-deterministic per-row failures.
    for (const diffEntry of diffEntries) {
      if (diffEntry.paymentAmount === 0) {
        continue;
      }
      await this.saleInvoiceModel().changePaymentAmount(
        diffEntry.invoiceId,
        diffEntry.paymentAmount,
        trx,
      );
    }
  }
}
