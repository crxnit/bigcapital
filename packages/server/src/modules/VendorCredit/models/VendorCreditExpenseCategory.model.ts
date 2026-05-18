import { Model } from 'objection';
import { BaseModel } from '@/models/Model';

/**
 * Direct-account allocation row on a Vendor Credit. Mirrors
 * BillExpenseCategory shape (account + description + amount), trimmed for
 * v1 — no landed-cost flag, no amount_type/percent. Used by the categories
 * panel on the vendor credit form so a credit can be entered without
 * picking individual items.
 */
export class VendorCreditExpenseCategory extends BaseModel {
  public vendorCreditId!: number;
  public expenseAccountId!: number;
  public index!: number;
  public description!: string;
  public amount!: number;

  static get tableName() {
    return 'vendor_credit_expense_categories';
  }

  static get relationMappings() {
    // Relative path inside relationMappings — `@/` alias does NOT resolve
    // at runtime in Objection relationMappings (CLAUDE.md gotcha).
    const { Account } = require('../../Accounts/models/Account.model');
    const { VendorCredit } = require('./VendorCredit');

    return {
      expenseAccount: {
        relation: Model.BelongsToOneRelation,
        modelClass: Account,
        join: {
          from: 'vendor_credit_expense_categories.expenseAccountId',
          to: 'accounts.id',
        },
      },
      vendorCredit: {
        relation: Model.BelongsToOneRelation,
        modelClass: VendorCredit,
        join: {
          from: 'vendor_credit_expense_categories.vendorCreditId',
          to: 'vendor_credits.id',
        },
      },
    };
  }
}
