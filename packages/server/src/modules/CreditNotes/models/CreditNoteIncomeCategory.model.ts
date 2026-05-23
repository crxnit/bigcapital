import { Model } from 'objection';
import { BaseModel } from '@/models/Model';

/**
 * Direct-account allocation row on a CreditNote. Mirrors the
 * SaleInvoiceIncomeCategory shape (account + description + amount) but
 * on the AR-credit side: each row debits the chosen income account
 * (reversing what the original invoice credited), summing into the
 * credit note's amount alongside the item-entries subtotal.
 *
 * Trimmed for v1: no `amount_type` / `percent` columns (no driver yet on
 * credit notes).
 */
export class CreditNoteIncomeCategory extends BaseModel {
  public creditNoteId!: number;
  public incomeAccountId!: number;
  public index!: number;
  public description!: string;
  public amount!: number;

  static get tableName() {
    return 'credit_note_income_categories';
  }

  static get relationMappings() {
    // Relative path inside relationMappings — `@/` alias does NOT resolve
    // at runtime in Objection relationMappings (CLAUDE.md gotcha).
    const { Account } = require('../../Accounts/models/Account.model');
    const { CreditNote } = require('./CreditNote');

    return {
      incomeAccount: {
        relation: Model.BelongsToOneRelation,
        modelClass: Account,
        join: {
          from: 'credit_note_income_categories.incomeAccountId',
          to: 'accounts.id',
        },
      },
      creditNote: {
        relation: Model.BelongsToOneRelation,
        modelClass: CreditNote,
        join: {
          from: 'credit_note_income_categories.creditNoteId',
          to: 'credit_notes.id',
        },
      },
    };
  }
}
