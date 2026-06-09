import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import * as yup from 'yup';
import * as uniqid from 'uniqid';
import { Importable } from '../../Import/Importable';
import { CreateUncategorizedTransactionService } from './CreateUncategorizedTransaction.service';
import { ImportableContext, ImportSkippedRow } from '../../Import/interfaces';
import { BankTransactionsSampleData } from '../../BankingTransactions/constants';
import { Account } from '@/modules/Accounts/models/Account.model';
import { CreateUncategorizedTransactionDTO } from '../types/BankingCategorize.types';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ImportableService } from '../../Import/decorators/Import.decorator';
import { UncategorizedBankTransaction } from '../../BankingTransactions/models/UncategorizedBankTransaction';
@Injectable()
@ImportableService({ name: UncategorizedBankTransaction.name })
export class UncategorizedTransactionsImportable extends Importable {
  constructor(
    private readonly createUncategorizedTransaction: CreateUncategorizedTransactionService,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,

    @Inject(UncategorizedBankTransaction.name)
    private readonly uncategorizedBankTransaction: TenantModelProxy<
      typeof UncategorizedBankTransaction
    >,
  ) {
    super();
  }

  /**
   * Passing the sheet DTO to create uncategorized transaction.
   *
   * De-dupe on re-import: a bank statement re-uploaded (a fresh `batch`) must
   * not double its rows. We skip a row when an identical one — same
   * (accountId, date, amount, payee) — already exists from a DIFFERENT batch.
   * Excluding the current batch is deliberate: two genuinely-identical lines
   * within the SAME statement (e.g. two equal same-day charges to one payee)
   * are legitimate and must both import. Rows run sequentially on the shared
   * trx (ImportFileCommon concurrency:1), so this check sees prior rows safely.
   * @param {CreateUncategorizedTransactionDTO,} createDTO
   * @param {Knex.Transaction} trx
   */
  public async importable(
    createDTO: CreateUncategorizedTransactionDTO,
    trx?: Knex.Transaction,
  ) {
    const { accountId, date, amount, payee, batch } = createDTO as any;

    const existing = await this.uncategorizedBankTransaction()
      .query(trx)
      .where('accountId', accountId)
      .where('date', date)
      .where('amount', amount)
      .where((q) => {
        // NULL-safe payee match (MySQL `= NULL` is never true).
        if (payee === null || payee === undefined || payee === '') {
          q.whereNull('payee').orWhere('payee', '');
        } else {
          q.where('payee', payee);
        }
      })
      .modify((q) => {
        // Only collide against OTHER imports, never the current batch.
        if (batch) {
          q.whereNot('batch', batch);
        }
      })
      .first();

    // Already imported in a prior batch — skip (reported as "skipped", not
    // "created", so a re-import doesn't falsely claim it added rows).
    if (existing) {
      return new ImportSkippedRow(
        existing,
        'Already imported in a previous upload (same account, date, amount & payee).',
      );
    }
    return this.createUncategorizedTransaction.create(createDTO, trx);
  }

  /**
   * Transformes the DTO before validating and importing.
   * @param {CreateUncategorizedTransactionDTO} createDTO
   * @param {ImportableContext} context
   * @returns {CreateUncategorizedTransactionDTO}
   */
  public transform(
    createDTO: CreateUncategorizedTransactionDTO,
    context?: ImportableContext,
  ): CreateUncategorizedTransactionDTO {
    // `type` is a transient import-only column from the meta — apply the
    // direction (deposit/credit → +, withdrawal/debit → -) and strip it from
    // the DTO before insert. When absent, leave the amount sign untouched so
    // signed-amount CSVs still work.
    const { type, amount, ...rest } = createDTO as any;
    let signedAmount = amount;
    if (type) {
      const abs = Math.abs(amount);
      signedAmount = type === 'withdrawal' || type === 'debit' ? -abs : abs;
    }
    return {
      ...rest,
      amount: signedAmount,
      accountId: context.import.paramsParsed.accountId,
      batch: context.import.paramsParsed.batch,
    };
  }

  /**
   * Sample data used to download sample sheet.
   * @returns {Record<string, any>[]}
   */
  public sampleData(): Record<string, any>[] {
    return BankTransactionsSampleData;
  }

  // ------------------
  // # Params
  // ------------------
  /**
   * Params validation schema.
   * @returns {ValidationSchema[]}
   */
  public paramsValidationSchema() {
    return yup.object().shape({
      accountId: yup.number().required(),
    });
  }

  /**
   * Validates the params existance asyncly.
   * @param {number} tenantId -
   * @param {Record<string, any>} params -
   */
  public async validateParams(params: Record<string, any>): Promise<void> {
    if (params.accountId) {
      await this.accountModel()
        .query()
        .findById(params.accountId)
        .throwIfNotFound({});
    }
  }

  /**
   * Transforms the import params before storing them.
   * @param {Record<string, any>} parmas
   */
  public transformParams(parmas: Record<string, any>) {
    const batch = uniqid();

    return {
      ...parmas,
      batch,
    };
  }
}
