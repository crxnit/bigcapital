import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { RefundSyncCreditRefundedAmount } from '@/modules/VendorCreditsRefund/commands/RefundSyncCreditRefundedAmount.service';
import {
  IRefundVendorCreditCreatedPayload,
  IRefundVendorCreditDeletedPayload,
} from '@/modules/VendorCreditsRefund/types/VendorCreditRefund.types';

@Injectable()
export class RefundSyncVendorCreditBalanceSubscriber {
  constructor(
    private readonly refundSyncCreditRefunded: RefundSyncCreditRefundedAmount,
  ) {}

  /**
   * Increment refunded vendor credit amount once refund transaction created.
   */
  @OnEvent(events.vendorCredit.onRefundCreated)
  async incrementRefundedAmountOnceRefundCreated({
    refundVendorCredit,
    trx,
  }: IRefundVendorCreditCreatedPayload) {
    await this.refundSyncCreditRefunded.incrementCreditRefundedAmount(
      refundVendorCredit.vendorCreditId,
      refundVendorCredit.amount,
      trx,
    );
  }

  /**
   * Decrement refunded vendor credit amount once refund transaction deleted.
   */
  @OnEvent(events.vendorCredit.onRefundDeleted)
  async decrementRefundedAmountOnceRefundDeleted({
    oldRefundCredit,
    trx,
  }: IRefundVendorCreditDeletedPayload) {
    await this.refundSyncCreditRefunded.decrementCreditNoteRefundAmount(
      oldRefundCredit.vendorCreditId,
      oldRefundCredit.amount,
      trx,
    );
  }
}
