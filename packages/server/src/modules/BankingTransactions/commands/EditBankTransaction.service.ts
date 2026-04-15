import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { UnitOfWork } from '@/modules/Tenancy/TenancyDB/UnitOfWork.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { BankTransaction } from '../models/BankTransaction';
import { EditBankTransactionDto } from '../dtos/EditBankTransaction.dto';

/**
 * Updates descriptive metadata on an existing bank transaction row in
 * `cashflow_transactions`. Intentionally excludes any field that
 * affects the general-ledger posting — amount, accounts, date, and
 * exchange rate require uncategorize → recategorize so the journal
 * entry is reversed and re-posted.
 *
 * See UAT feedback: "Once you categorize a transaction, you cannot
 * change ANYTHING regarding the transaction (coding, memo, reference,
 * anything)." This service addresses the memo/reference/number half;
 * category-level changes still go through uncategorize + recategorize.
 */
@Injectable()
export class EditBankTransactionService {
  constructor(
    private readonly uow: UnitOfWork,

    @Inject(BankTransaction.name)
    private readonly bankTransactionModel: TenantModelProxy<
      typeof BankTransaction
    >,
  ) {}

  async editTransaction(
    transactionId: number,
    dto: EditBankTransactionDto,
  ): Promise<BankTransaction> {
    const existing = await this.bankTransactionModel()
      .query()
      .findById(transactionId);

    if (!existing) {
      throw new NotFoundException('Bank transaction not found.');
    }

    // Only include fields the caller actually set — `PATCH` semantics.
    // Avoids accidentally clearing a field by omission in the payload.
    const patch: Partial<BankTransaction> = {};
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.referenceNo !== undefined) patch.referenceNo = dto.referenceNo;
    if (dto.transactionNumber !== undefined)
      patch.transactionNumber = dto.transactionNumber;

    if (Object.keys(patch).length === 0) return existing;

    return this.uow.withTransaction(async (trx: Knex.Transaction) => {
      await this.bankTransactionModel()
        .query(trx)
        .findById(transactionId)
        .patch(patch);

      return this.bankTransactionModel()
        .query(trx)
        .findById(transactionId)
        .throwIfNotFound();
    });
  }
}
