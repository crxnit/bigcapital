import { Model } from 'objection';
import { BaseModel } from '@/models/Model';

/**
 * Direct-account allocation row on a Bill. Mirrors the Expense form's
 * `expense_transaction_categories` shape (account + description + amount)
 * but trimmed for v1: no `landed_cost` flag (bills have a separate
 * landed-cost mechanism on items entries) and no `amount_type` /
 * `percent` columns (no driver yet on bills).
 */
export class BillExpenseCategory extends BaseModel {
  public billId!: number;
  public expenseAccountId!: number;
  public index!: number;
  public description!: string;
  public amount!: number;

  static get tableName() {
    return 'bill_expense_categories';
  }

  static get relationMappings() {
    // Relative path inside relationMappings — `@/` alias does NOT resolve
    // at runtime in Objection relationMappings (CLAUDE.md gotcha).
    const { Account } = require('../../Accounts/models/Account.model');
    const { Bill } = require('./Bill');

    return {
      expenseAccount: {
        relation: Model.BelongsToOneRelation,
        modelClass: Account,
        join: {
          from: 'bill_expense_categories.expenseAccountId',
          to: 'accounts.id',
        },
      },
      bill: {
        relation: Model.BelongsToOneRelation,
        modelClass: Bill,
        join: {
          from: 'bill_expense_categories.billId',
          to: 'bills.id',
        },
      },
    };
  }
}
