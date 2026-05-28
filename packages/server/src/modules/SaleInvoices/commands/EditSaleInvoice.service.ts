import { Knex } from 'knex';
import { Inject, Injectable } from '@nestjs/common';
import {
  ISaleInvoiceEditDTO,
  ISaleInvoiceEditedPayload,
  ISaleInvoiceEditingPayload,
} from '../SaleInvoice.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommandSaleInvoiceValidators } from './CommandSaleInvoiceValidators.service';
import { CommandSaleInvoiceDTOTransformer } from './CommandSaleInvoiceDTOTransformer.service';
import { UnitOfWork } from '@/modules/Tenancy/TenancyDB/UnitOfWork.service';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { events } from '@/common/events/events';
import { SaleInvoice } from '../models/SaleInvoice';
import { Customer } from '@/modules/Customers/models/Customer';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { EditSaleInvoiceDto } from '../dtos/SaleInvoice.dto';

@Injectable()
export class EditSaleInvoice {
  /**
   * @param {ItemsEntriesService} itemsEntriesService - Items entries service.
   * @param {EventEmitter2} eventPublisher - Event emitter.
   * @param {CommandSaleInvoiceValidators} validators - Command sale invoice validators.
   * @param {CommandSaleInvoiceDTOTransformer} transformerDTO - Command sale invoice DTO transformer.
   * @param {UnitOfWork} uow - Unit of work.
   * @param {TenantModelProxy<typeof SaleInvoice>} saleInvoiceModel - Sale invoice model.
   * @param {TenantModelProxy<typeof Customer>} customerModel - Customer model.
   */
  constructor(
    private readonly itemsEntriesService: ItemsEntriesService,
    private readonly eventPublisher: EventEmitter2,
    private readonly validators: CommandSaleInvoiceValidators,
    private readonly transformerDTO: CommandSaleInvoiceDTOTransformer,
    private readonly uow: UnitOfWork,

    @Inject(SaleInvoice.name)
    private readonly saleInvoiceModel: TenantModelProxy<typeof SaleInvoice>,

    @Inject(Customer.name)
    private readonly customerModel: TenantModelProxy<typeof Customer>,
  ) {}

  /**
   * Edit the given sale invoice.
   * @async
   * @param {Number} saleInvoiceId - Sale invoice id.
   * @param {ISaleInvoice} saleInvoice - Sale invoice DTO object.
   * @return {Promise<ISaleInvoice>}
   */
  public async editSaleInvoice(
    saleInvoiceId: number,
    saleInvoiceDTO: EditSaleInvoiceDto,
  ): Promise<SaleInvoice> {
    // Retrieve the sale invoice or throw not found service error.
    const oldSaleInvoice = await this.saleInvoiceModel()
      .query()
      .findById(saleInvoiceId)
      .withGraphJoined('entries');

    // Validates the given invoice existance.
    this.validators.validateInvoiceExistance(oldSaleInvoice);

    // Validate customer existance.
    const customer = await this.customerModel()
      .query()
      .findById(saleInvoiceDTO.customerId)
      .throwIfNotFound();

    // Invoices may have no items entries (direct-account income
    // allocations only); pass an empty array so the shared validators
    // don't crash on undefined.
    const invoiceEntries = saleInvoiceDTO.entries || [];

    this.validators.validateAtLeastOneLine(
      invoiceEntries,
      saleInvoiceDTO.categories,
    );

    // Validate items ids existance.
    await this.itemsEntriesService.validateItemsIdsExistance(invoiceEntries);
    // Validate non-sellable entries items.
    await this.itemsEntriesService.validateNonSellableEntriesItems(
      invoiceEntries,
    );
    // Validate the items entries existance.
    await this.itemsEntriesService.validateEntriesIdsExistance(
      saleInvoiceId,
      'SaleInvoice',
      invoiceEntries,
    );

    // Validate direct-account allocation rows reference income-type accounts.
    if (saleInvoiceDTO.categories && saleInvoiceDTO.categories.length > 0) {
      await this.validators.validateInvoiceCategoryAccountsType(
        saleInvoiceDTO.categories,
      );
    }
    // Transform DTO object to model object.
    const saleInvoiceObj = await this.tranformEditDTOToModel(
      customer,
      saleInvoiceDTO,
      oldSaleInvoice,
    );
    // Validate sale invoice number uniquiness.
    if (saleInvoiceObj.invoiceNo) {
      await this.validators.validateInvoiceNumberUnique(
        saleInvoiceObj.invoiceNo,
        saleInvoiceId,
      );
    }
    // Validate the invoice amount is not smaller than the invoice payment amount.
    this.validators.validateInvoiceAmountBiggerPaymentAmount(
      saleInvoiceObj.balance,
      oldSaleInvoice.paymentAmount,
    );
    // Edit sale invoice transaction in UOW envirment.
    return this.uow.withTransaction(async (trx: Knex.Transaction) => {
      // Triggers `onSaleInvoiceEditing` event.
      await this.eventPublisher.emitAsync(events.saleInvoice.onEditing, {
        trx,
        oldSaleInvoice,
        saleInvoiceDTO,
      } as ISaleInvoiceEditingPayload);

      // Upsert the the invoice graph to the storage.
      // `.query(trx)` (not `.query()`): the document write must share the
      // UoW trx so the subsequent GL-rewrite event runs atomically with
      // it — without trx, an autocommit upsert ahead of a failing GL
      // write leaves the document mutated but the ledger stale.
      const saleInvoice = await this.saleInvoiceModel()
        .query(trx)
        .upsertGraphAndFetch({
          id: saleInvoiceId,
          ...saleInvoiceObj,
        });
      // Edit event payload.
      const editEventPayload: ISaleInvoiceEditedPayload = {
        saleInvoiceId,
        saleInvoice,
        saleInvoiceDTO,
        oldSaleInvoice,
        trx,
      };
      // Triggers `onSaleInvoiceEdited` event.
      await this.eventPublisher.emitAsync(
        events.saleInvoice.onEdited,
        editEventPayload,
      );
      return saleInvoice;
    });
  }

  /**
   * Transformes edit DTO to model.
   * @param {ICustomer} customer -
   * @param {ISaleInvoiceEditDTO} saleInvoiceDTO -
   * @param {ISaleInvoice} oldSaleInvoice
   */
  private tranformEditDTOToModel = async (
    customer: Customer,
    saleInvoiceDTO: EditSaleInvoiceDto,
    oldSaleInvoice: SaleInvoice,
  ) => {
    return this.transformerDTO.transformDTOToModel(
      customer,
      saleInvoiceDTO,
      oldSaleInvoice,
    );
  };
}
