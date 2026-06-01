import { sumBy } from 'lodash';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import {
  IVendorCreditApplyToBillDeletedPayload,
  IVendorCreditApplyToBillsCreatedPayload,
} from '../types/VendorCreditApplyBills.types';
import { ApplyVendorCreditSyncBillsService } from '../command/ApplyVendorCreditSyncBills.service';
import { ApplyVendorCreditSyncInvoicedService } from '../command/ApplyVendorCreditSyncInvoiced.service';

@Injectable()
export class VendorCreditApplyBillsSyncSubscriber {
  constructor(
    private readonly syncBillsWithVendorCredit: ApplyVendorCreditSyncBillsService,
    private readonly syncCreditWithInvoiced: ApplyVendorCreditSyncInvoicedService,
  ) {}

  /**
   * Increments the applied bills' credited amount and the vendor credit's
   * invoiced amount once a vendor credit is applied to bills.
   * @param {IVendorCreditApplyToBillsCreatedPayload} payload
   */
  @OnEvent(events.vendorCredit.onApplyToInvoicesCreated)
  async syncOnApplyToBillsCreated({
    vendorCredit,
    vendorCreditAppliedBills,
    trx,
  }: IVendorCreditApplyToBillsCreatedPayload) {
    // Coerce amount to a number — never sumBy(rows, 'amount') (string-concat trap).
    const amount = sumBy(
      vendorCreditAppliedBills,
      (b) => Number(b.amount) || 0,
    );

    await this.syncBillsWithVendorCredit.incrementBillsCreditedAmount(
      vendorCreditAppliedBills,
      trx,
    );
    await this.syncCreditWithInvoiced.incrementVendorCreditInvoicedAmount(
      vendorCredit.id,
      amount,
      trx,
    );
  }

  /**
   * Decrements the applied bill's credited amount and the vendor credit's
   * invoiced amount once an apply-to-bills transaction is deleted.
   * @param {IVendorCreditApplyToBillDeletedPayload} payload
   */
  @OnEvent(events.vendorCredit.onApplyToInvoicesDeleted)
  async syncOnApplyToBillsDeleted({
    oldCreditAppliedToBill,
    trx,
  }: IVendorCreditApplyToBillDeletedPayload) {
    await this.syncBillsWithVendorCredit.decrementBillCreditedAmount(
      oldCreditAppliedToBill,
      trx,
    );
    await this.syncCreditWithInvoiced.decrementVendorCreditInvoicedAmount(
      oldCreditAppliedToBill.vendorCreditId,
      oldCreditAppliedToBill.amount,
      trx,
    );
  }
}
