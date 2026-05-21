import { Inject, Injectable } from '@nestjs/common';
import { SaleInvoice } from '../models/SaleInvoice';
import { ServiceError } from '@/modules/Items/ServiceError';
import { ERRORS } from '../constants';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ItemEntryDto } from '@/modules/TransactionItemEntry/dto/ItemEntry.dto';
import { SaleInvoiceIncomeCategoryDto } from '../dtos/SaleInvoice.dto';
import { Account } from '@/modules/Accounts/models/Account.model';
import { ACCOUNT_ROOT_TYPE } from '@/constants/accounts';

@Injectable()
export class CommandSaleInvoiceValidators {
  constructor(
    @Inject(SaleInvoice.name)
    private readonly saleInvoiceModel: TenantModelProxy<typeof SaleInvoice>,

    @Inject(Account.name)
    private readonly accountModel: TenantModelProxy<typeof Account>,
  ) {}

  /**
   * An invoice must carry at least one items entry OR one direct-account
   * income allocation. Empty invoices are rejected.
   */
  public validateAtLeastOneLine(
    entries: ItemEntryDto[] | undefined,
    categories: SaleInvoiceIncomeCategoryDto[] | undefined,
  ) {
    const hasEntries = (entries || []).length > 0;
    const hasCategories = (categories || []).length > 0;
    if (!hasEntries && !hasCategories) {
      throw new ServiceError(ERRORS.SALE_INVOICE_NO_LINES);
    }
  }

  /**
   * Each direct-account allocation must point at an INCOME-root-type
   * account. Mirrors validateBillCategoryAccountsType on the expense side.
   */
  public async validateInvoiceCategoryAccountsType(
    categories: SaleInvoiceIncomeCategoryDto[],
  ) {
    const accountIds = Array.from(
      new Set(categories.map((c) => c.incomeAccountId).filter(Boolean)),
    );
    if (accountIds.length === 0) return;
    const accounts = await this.accountModel()
      .query()
      .whereIn('id', accountIds);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of accountIds) {
      const acc = byId.get(id);
      if (!acc || !acc.isRootType(ACCOUNT_ROOT_TYPE.INCOME)) {
        throw new ServiceError(
          ERRORS.SALE_INVOICE_CATEGORY_ACCOUNT_INVALID_TYPE,
        );
      }
    }
  }

  /**
   * Validates the given invoice is existance.
   * @param {SaleInvoice | undefined} invoice
   */
  public validateInvoiceExistance(invoice: SaleInvoice | undefined) {
    if (!invoice) {
      throw new ServiceError(ERRORS.SALE_INVOICE_NOT_FOUND);
    }
  }

  /**
   * Validate whether sale invoice number unqiue on the storage.
   * @param {string} invoiceNumber -
   * @param {number} notInvoiceId -
   */
  public async validateInvoiceNumberUnique(
    invoiceNumber: string,
    notInvoiceId?: number,
  ) {
    const saleInvoice = await this.saleInvoiceModel()
      .query()
      .findOne('invoice_no', invoiceNumber)
      .onBuild((builder) => {
        if (notInvoiceId) {
          builder.whereNot('id', notInvoiceId);
        }
      });
    if (saleInvoice) {
      throw new ServiceError(ERRORS.INVOICE_NUMBER_NOT_UNIQUE);
    }
  }

  /**
   * Validate the invoice amount is bigger than payment amount before edit the invoice.
   * @param {number} saleInvoiceAmount
   * @param {number} paymentAmount
   */
  public validateInvoiceAmountBiggerPaymentAmount(
    saleInvoiceAmount: number,
    paymentAmount: number,
  ) {
    if (saleInvoiceAmount < paymentAmount) {
      throw new ServiceError(ERRORS.INVOICE_AMOUNT_SMALLER_THAN_PAYMENT_AMOUNT);
    }
  }

  /**
   * Validate the invoice number require.
   * @param {ISaleInvoice} saleInvoiceObj
   */
  public validateInvoiceNoRequire(invoiceNo: string) {
    if (!invoiceNo) {
      throw new ServiceError(ERRORS.SALE_INVOICE_NO_IS_REQUIRED);
    }
  }

  /**
   * Validate the given customer has no sales invoices.
   * @param {number} customerId - Customer id.
   */
  public async validateCustomerHasNoInvoices(customerId: number) {
    const invoices = await this.saleInvoiceModel()
      .query()
      .where('customer_id', customerId);

    if (invoices.length > 0) {
      throw new ServiceError(ERRORS.CUSTOMER_HAS_SALES_INVOICES);
    }
  }
}
