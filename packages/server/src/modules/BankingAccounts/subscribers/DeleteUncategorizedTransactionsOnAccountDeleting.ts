import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { IAccountEventDeletePayload } from '@/interfaces/Account';
import { RevertRecognizedTransactionsService } from '@/modules/BankingTranasctionsRegonize/commands/RevertRecognizedTransactions.service';
import { UncategorizedBankTransaction } from '@/modules/BankingTransactions/models/UncategorizedBankTransaction';
import { DeleteBankRulesService } from '@/modules/BankRules/commands/DeleteBankRules.service';
import { BankRule } from '@/modules/BankRules/models/BankRule';
import { MatchedBankTransaction } from '@/modules/BankingMatching/models/MatchedBankTransaction';
import { RecognizedBankTransaction } from '@/modules/BankingTranasctionsRegonize/models/RecognizedBankTransaction';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';

@Injectable()
export class DeleteUncategorizedTransactionsOnAccountDeleting {
  constructor(
    private readonly deleteBankRules: DeleteBankRulesService,
    private readonly revertRecognizedTransactins: RevertRecognizedTransactionsService,

    @Inject(BankRule.name)
    private bankRuleModel: TenantModelProxy<typeof BankRule>,

    @Inject(UncategorizedBankTransaction.name)
    private uncategorizedCashflowTransactionModel: TenantModelProxy<
      typeof UncategorizedBankTransaction
    >,

    @Inject(MatchedBankTransaction.name)
    private matchedBankTransactionModel: TenantModelProxy<
      typeof MatchedBankTransaction
    >,

    @Inject(RecognizedBankTransaction.name)
    private recognizedBankTransactionModel: TenantModelProxy<
      typeof RecognizedBankTransaction
    >,
  ) {}

  /**
   * Handles revert the recognized transactions and delete all the bank rules
   * associated to the deleted bank account.
   * @param {IAccountEventDeletePayload}
   */
  @OnEvent(events.accounts.onDelete)
  public async handleDeleteBankRulesOnAccountDeleting({
    oldAccount,
    trx,
  }: IAccountEventDeletePayload) {
    const foundAssociatedRules = await this.bankRuleModel()
      .query(trx)
      .where('applyIfAccountId', oldAccount.id);
    const foundAssociatedRulesIds = foundAssociatedRules.map((rule) => rule.id);

    // Revert the recognized transactions of the given bank rules. Skip when
    // no rules are tied to this account — passing an empty list would cause
    // RevertRecognizedTransactions to fall through its rule filter and revert
    // every recognized transaction across all bank accounts.
    if (foundAssociatedRulesIds.length > 0) {
      await this.revertRecognizedTransactins.revertRecognizedTransactions(
        foundAssociatedRulesIds,
        null,
        trx,
      );
    }

    // Collect uncategorized cashflow rows belonging to this account so we can
    // drop their dependent matched/recognized rows before the parent delete.
    // The FKs have no ON DELETE CASCADE — service-side cleanup per fork
    // convention.
    const uncategorizedIds = (
      await this.uncategorizedCashflowTransactionModel()
        .query(trx)
        .where('accountId', oldAccount.id)
        .select('id')
    ).map((row) => row.id);

    if (uncategorizedIds.length > 0) {
      await this.matchedBankTransactionModel()
        .query(trx)
        .whereIn('uncategorizedTransactionId', uncategorizedIds)
        .delete();

      await this.recognizedBankTransactionModel()
        .query(trx)
        .whereIn('uncategorizedTransactionId', uncategorizedIds)
        .delete();
    }

    // Delete the associated uncategorized transactions.
    await this.uncategorizedCashflowTransactionModel()
      .query(trx)
      .where('accountId', oldAccount.id)
      .delete();

    // Delete the given bank rules.
    await this.deleteBankRules.deleteBankRules(foundAssociatedRulesIds, trx);
  }
}
