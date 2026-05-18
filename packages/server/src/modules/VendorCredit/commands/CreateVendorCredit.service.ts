import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import {
  IVendorCreditCreatedPayload,
  IVendorCreditCreatingPayload,
} from '@/modules/VendorCredit/types/VendorCredit.types';
import { VendorCredit } from '../models/VendorCredit';
import { Vendor } from '@/modules/Vendors/models/Vendor';
import { events } from '@/common/events/events';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { UnitOfWork } from '@/modules/Tenancy/TenancyDB/UnitOfWork.service';
import { VendorCreditDTOTransformService } from './VendorCreditDTOTransform.service';
import { VendorCreditsValidators } from './VendorCreditsValidators.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { CreateVendorCreditDto } from '../dtos/VendorCredit.dto';

@Injectable()
export class CreateVendorCreditService {
  /**
   * @param {UnitOfWork} uow - The unit of work service.
   * @param {ItemsEntriesService} itemsEntriesService - The items entries service.
   * @param {EventEmitter2} eventPublisher - The event emitter service.
   * @param {typeof VendorCredit} vendorCreditModel - The vendor credit model.
   * @param {typeof Vendor} vendorModel - The vendor model.
   */
  constructor(
    private readonly uow: UnitOfWork,
    private readonly itemsEntriesService: ItemsEntriesService,
    private readonly eventPublisher: EventEmitter2,
    private readonly vendorCreditDTOTransformService: VendorCreditDTOTransformService,
    private readonly validators: VendorCreditsValidators,

    @Inject(VendorCredit.name)
    private readonly vendorCreditModel: TenantModelProxy<typeof VendorCredit>,

    @Inject(Vendor.name)
    private readonly vendorModel: TenantModelProxy<typeof Vendor>,
  ) {}

  /**
   * Creates a new vendor credit.
   * @param {IVendorCreditCreateDTO} vendorCreditCreateDTO -
   * @param {Knex.Transaction} trx -
   */
  public newVendorCredit = async (
    vendorCreditCreateDTO: CreateVendorCreditDto,
    trx?: Knex.Transaction,
  ) => {
    // Triggers `onVendorCreditCreate` event.
    await this.eventPublisher.emitAsync(events.vendorCredit.onCreate, {
      vendorCreditCreateDTO,
    });
    // Retrieve the given vendor or throw not found service error.
    const vendor = await this.vendorModel()
      .query()
      .findById(vendorCreditCreateDTO.vendorId)
      .throwIfNotFound();

    // Credits may now ship without any items entries (direct-account
    // allocations only). The entries-array validators are array-based; pass
    // an empty array so they no-op cleanly when only categories were entered.
    const dtoEntries = vendorCreditCreateDTO.entries || [];

    // Validate at least one line (entries OR categories) is non-empty.
    this.validators.validateAtLeastOneLine(
      dtoEntries,
      vendorCreditCreateDTO.categories,
    );

    // Validate items should be purchasable — a vendor credit is a purchase-side
    // document (vendor refunding/crediting items you bought), so the entries
    // must reference purchasable items, not sellable ones.
    await this.itemsEntriesService.validateNonPurchasableEntriesItems(
      dtoEntries,
    );

    // Validate direct-account allocation rows reference expense-type accounts.
    if (
      vendorCreditCreateDTO.categories &&
      vendorCreditCreateDTO.categories.length > 0
    ) {
      await this.validators.validateCategoryAccountsType(
        vendorCreditCreateDTO.categories,
      );
    }
    // Transforms the credit DTO to storage layer.
    const vendorCreditModel =
      await this.vendorCreditDTOTransformService.transformCreateEditDTOToModel(
        vendorCreditCreateDTO,
        vendor.currencyCode,
      );
    // Saves the vendor credit transactions under UOW environment.
    return this.uow.withTransaction(async (trx: Knex.Transaction) => {
      // Triggers `onVendorCreditCreating` event.
      await this.eventPublisher.emitAsync(events.vendorCredit.onCreating, {
        vendorCreditCreateDTO,
        trx,
      } as IVendorCreditCreatingPayload);

      // Saves the vendor credit graph.
      const vendorCredit = await this.vendorCreditModel()
        .query(trx)
        .upsertGraphAndFetch({
          ...vendorCreditModel,
        });

      // Triggers `onVendorCreditCreated` event.
      await this.eventPublisher.emitAsync(events.vendorCredit.onCreated, {
        vendorCredit,
        vendorCreditCreateDTO,
        trx,
      } as IVendorCreditCreatedPayload);

      return vendorCredit;
    }, trx);
  };
}
