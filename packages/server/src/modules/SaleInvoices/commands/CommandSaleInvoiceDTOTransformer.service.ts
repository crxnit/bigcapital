import { Inject, Injectable } from '@nestjs/common';
import { omit, sumBy } from 'lodash';
import * as R from 'ramda';
import * as moment from 'moment';
import '../../../utils/moment-mysql';
import * as composeAsync from 'async/compose';
import { Customer } from '@/modules/Customers/models/Customer';
import { BranchTransactionDTOTransformer } from '@/modules/Branches/integrations/BranchTransactionDTOTransform';
import { WarehouseTransactionDTOTransform } from '@/modules/Warehouses/Integrations/WarehouseTransactionDTOTransform';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { ItemEntry } from '@/modules/TransactionItemEntry/models/ItemEntry';
import { CommandSaleInvoiceValidators } from './CommandSaleInvoiceValidators.service';
import { SaleInvoiceIncrement } from './SaleInvoiceIncrement.service';
import { BrandingTemplateDTOTransformer } from '@/modules/PdfTemplate/BrandingTemplateDTOTransformer';
import { SaleInvoice } from '../models/SaleInvoice';
import { assocItemEntriesDefaultIndex } from '@/utils/associate-item-entries-index';
import { formatDateFields } from '@/utils/format-date-fields';
import { ItemEntriesTaxTransactions } from '@/modules/TaxRates/ItemEntriesTaxTransactions.service';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import {
  CreateSaleInvoiceDto,
  EditSaleInvoiceDto,
} from '../dtos/SaleInvoice.dto';
import { normalizeAllocationCategories } from '@/modules/_shared/allocations/AllocationCategory.helpers';

@Injectable()
export class CommandSaleInvoiceDTOTransformer {
  /**
   * @param {BranchTransactionDTOTransformer} branchDTOTransform - Branch transaction DTO transformer.
   * @param {WarehouseTransactionDTOTransform} warehouseDTOTransform - Warehouse transaction DTO transformer.
   * @param {ItemsEntriesService} itemsEntriesService - Items entries service.
   * @param {CommandSaleInvoiceValidators} validators - Command sale invoice validators.
   * @param {SaleInvoiceIncrement} invoiceIncrement - Sale invoice increment.
   * @param {ItemEntriesTaxTransactions} taxDTOTransformer - Item entries tax transactions.
   * @param {BrandingTemplateDTOTransformer} brandingTemplatesTransformer - Branding template DTO transformer.
   * @param {TenancyContext} tenancyContext - Tenancy context.
   * @param {SaleInvoice} saleInvoiceModel - Sale invoice model.
   */
  constructor(
    private branchDTOTransform: BranchTransactionDTOTransformer,
    private warehouseDTOTransform: WarehouseTransactionDTOTransform,
    private itemsEntriesService: ItemsEntriesService,
    private validators: CommandSaleInvoiceValidators,
    private invoiceIncrement: SaleInvoiceIncrement,
    private taxDTOTransformer: ItemEntriesTaxTransactions,
    private brandingTemplatesTransformer: BrandingTemplateDTOTransformer,
    private tenancyContext: TenancyContext,
  ) {}

  /**
   * Transformes the create DTO to invoice object model.
   * @param {ISaleInvoiceCreateDTO} saleInvoiceDTO - Sale invoice DTO.
   * @param {ISaleInvoice} oldSaleInvoice - Old sale invoice.
   * @return {ISaleInvoice}
   */
  public async transformDTOToModel(
    customer: Customer,
    saleInvoiceDTO: CreateSaleInvoiceDto | EditSaleInvoiceDto,
    oldSaleInvoice?: SaleInvoice,
  ): Promise<SaleInvoice> {
    const entriesModels = this.transformDTOEntriesToModels(saleInvoiceDTO);
    const itemsTotal = this.getDueBalanceItemEntries(entriesModels);

    // Normalize direct-account income allocations.
    const categories = normalizeAllocationCategories(
      saleInvoiceDTO.categories,
      { accountField: 'incomeAccountId' },
    );
    const categoriesTotal = sumBy(categories, (c) => Number(c.amount) || 0);
    // `balance` stores the invoice's gross amount (decremented by payments
    // later). Direct-account category allocations add to this alongside
    // the items-entries total.
    const amount = itemsTotal + categoriesTotal;

    // Retreive the next invoice number.
    const autoNextNumber = await this.invoiceIncrement.getNextInvoiceNumber();

    // Retrieve the authorized user.
    const authorizedUser = await this.tenancyContext.getSystemUser();

    // Invoice number.
    const invoiceNo =
      saleInvoiceDTO.invoiceNo || oldSaleInvoice?.invoiceNo || autoNextNumber;

    // Validate the invoice is required.
    this.validators.validateInvoiceNoRequire(invoiceNo);

    const dtoEntries = saleInvoiceDTO.entries || [];
    const initialEntries = dtoEntries.map((entry) => ({
      referenceType: 'SaleInvoice',
      isInclusiveTax: saleInvoiceDTO.isInclusiveTax,
      ...entry,
    }));
    const asyncEntries =
      initialEntries.length > 0
        ? await composeAsync(
            // Associate tax rate from tax id to entries.
            this.taxDTOTransformer.assocTaxRateFromTaxIdToEntries,
            // Associate tax rate id from tax code to entries.
            this.taxDTOTransformer.assocTaxRateIdFromCodeToEntries,
            // Sets default cost and sell account to invoice items entries.
            this.itemsEntriesService.setItemsEntriesDefaultAccounts,
          )(initialEntries)
        : [];

    const entries = R.compose(
      // Remove tax code from entries.
      R.map(R.omit(['taxCode'])),

      // Associate the default index for each item entry lin.
      assocItemEntriesDefaultIndex,
    )(asyncEntries);

    const initialDTO = {
      ...formatDateFields(
        omit(saleInvoiceDTO, [
          'delivered',
          'entries',
          'categories',
          'fromEstimateId',
          'attachments',
        ]),
        ['invoiceDate', 'dueDate'],
      ),
      // Avoid rewrite the deliver date in edit mode when already published.
      balance: amount,
      currencyCode: customer.currencyCode,
      exchangeRate: saleInvoiceDTO.exchangeRate || 1,
      ...(saleInvoiceDTO.delivered &&
        !oldSaleInvoice?.deliveredAt && {
          deliveredAt: moment().toMySqlDateTime(),
        }),
      // Avoid override payment amount in edit mode.
      ...(!oldSaleInvoice && { paymentAmount: 0 }),
      ...(invoiceNo ? { invoiceNo } : {}),
      entries,
      categories,
      userId: authorizedUser.id,
    } as SaleInvoice;

    const initialAsyncDTO = await composeAsync(
      this.branchDTOTransform.transformDTO<SaleInvoice>,
      this.warehouseDTOTransform.transformDTO<SaleInvoice>,

      // Assigns the default branding template id to the invoice DTO.
      this.brandingTemplatesTransformer.assocDefaultBrandingTemplate(
        'SaleInvoice',
      ),
    )(initialDTO);

    return R.compose(this.taxDTOTransformer.assocTaxAmountWithheldFromEntries)(
      initialAsyncDTO,
    );
  }

  /**
   * Transforms the DTO entries to invoice entries models.
   * @param {ISaleInvoiceCreateDTO | ISaleInvoiceEditDTO} entries
   * @returns {IItemEntry[]}
   */
  private transformDTOEntriesToModels = (
    saleInvoiceDTO: CreateSaleInvoiceDto | EditSaleInvoiceDto,
  ): ItemEntry[] => {
    return (saleInvoiceDTO.entries || []).map((entry) => {
      return ItemEntry.fromJson({
        ...entry,
        isInclusiveTax: saleInvoiceDTO.isInclusiveTax,
      });
    });
  };

  /**
   * Gets the due balance from the invoice entries.
   * @param {IItemEntry[]} entries
   * @returns {number}
   */
  private getDueBalanceItemEntries = (entries: ItemEntry[]) => {
    return sumBy(entries, (e) => e.amount);
  };
}
