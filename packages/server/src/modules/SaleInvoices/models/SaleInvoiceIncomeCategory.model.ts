import { Model } from 'objection';
import { BaseModel } from '@/models/Model';

/**
 * Direct-account allocation row on a SaleInvoice. Mirrors the
 * BillExpenseCategory shape (account + description + amount) on the revenue
 * side: each row credits the chosen income account, summing into the
 * invoice's balance/total alongside the item-entries subtotal.
 * Trimmed for v1: no `amount_type` / `percent` columns (no driver yet on
 * invoices).
 */
export class SaleInvoiceIncomeCategory extends BaseModel {
  public saleInvoiceId!: number;
  public incomeAccountId!: number;
  public index!: number;
  public description!: string;
  public amount!: number;

  static get tableName() {
    return 'sale_invoice_income_categories';
  }

  static get relationMappings() {
    // Relative path inside relationMappings — `@/` alias does NOT resolve
    // at runtime in Objection relationMappings (CLAUDE.md gotcha).
    const { Account } = require('../../Accounts/models/Account.model');
    const { SaleInvoice } = require('./SaleInvoice');

    return {
      incomeAccount: {
        relation: Model.BelongsToOneRelation,
        modelClass: Account,
        join: {
          from: 'sale_invoice_income_categories.incomeAccountId',
          to: 'accounts.id',
        },
      },
      saleInvoice: {
        relation: Model.BelongsToOneRelation,
        modelClass: SaleInvoice,
        join: {
          from: 'sale_invoice_income_categories.saleInvoiceId',
          to: 'sales_invoices.id',
        },
      },
    };
  }
}
