import { Knex } from 'knex';
import { Inject, Injectable } from '@nestjs/common';
import {
  IVendorCreditEditedPayload,
  IVendorCreditEditingPayload,
} from '../types/VendorCredit.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnitOfWork } from '@/modules/Tenancy/TenancyDB/UnitOfWork.service';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { VendorCredit } from '../models/VendorCredit';
import { Contact } from '@/modules/Contacts/models/Contact';
import { events } from '@/common/events/events';
import { VendorCreditDTOTransformService } from './VendorCreditDTOTransform.service';
import { VendorCreditsValidators } from './VendorCreditsValidators.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { EditVendorCreditDto } from '../dtos/VendorCredit.dto';

@Injectable()
export class EditVendorCreditService {
  /**
   * @param {EventEmitter2} eventPublisher - The event emitter service.
   * @param {UnitOfWork} uow - The unit of work service.
   * @param {ItemsEntriesService} itemsEntriesService - The items entries service.
   * @param {typeof VendorCredit} vendorCreditModel - The vendor credit model.
   * @param {typeof Contact} contactModel - The contact model.
   */
  constructor(
    private readonly eventPublisher: EventEmitter2,
    private readonly uow: UnitOfWork,
    private readonly itemsEntriesService: ItemsEntriesService,
    private readonly vendorCreditDTOTransform: VendorCreditDTOTransformService,
    private readonly validators: VendorCreditsValidators,

    @Inject(VendorCredit.name)
    private readonly vendorCreditModel: TenantModelProxy<typeof VendorCredit>,

    @Inject(Contact.name)
    private readonly contactModel: TenantModelProxy<typeof Contact>,
  ) {}

  /**
   * Deletes the given vendor credit.
   * @param {number} vendorCreditId - Vendor credit id.
   * @param {EditVendorCreditDto} vendorCreditDto -
   */
  public editVendorCredit = async (
    vendorCreditId: number,
    vendorCreditDTO: EditVendorCreditDto,
    trx?: Knex.Transaction,
  ) => {
    // Retrieve the vendor credit or throw not found service error.
    const oldVendorCredit = await this.vendorCreditModel()
      .query()
      .findById(vendorCreditId)
      .throwIfNotFound();

    // Validate customer existance.
    const vendor = await this.contactModel()
      .query()
      .modify('vendor')
      .findById(vendorCreditDTO.vendorId)
      .throwIfNotFound();

    // Credits may have no items entries (direct-account allocations only);
    // pass an empty array so the shared validators don't crash on undefined.
    const dtoEntries = vendorCreditDTO.entries || [];

    this.validators.validateAtLeastOneLine(
      dtoEntries,
      vendorCreditDTO.categories,
    );

    // Validate items ids existance.
    await this.itemsEntriesService.validateItemsIdsExistance(dtoEntries);
    // Validate items should be purchasable — a vendor credit is a purchase-side
    // document (vendor refunding/crediting items you bought), so the entries
    // must reference purchasable items, not sellable ones.
    await this.itemsEntriesService.validateNonPurchasableEntriesItems(
      dtoEntries,
    );
    // Validate the items entries existance.
    await this.itemsEntriesService.validateEntriesIdsExistance(
      vendorCreditId,
      'VendorCredit',
      dtoEntries,
    );

    // Validate direct-account allocation rows reference expense-type accounts.
    if (vendorCreditDTO.categories && vendorCreditDTO.categories.length > 0) {
      await this.validators.validateCategoryAccountsType(
        vendorCreditDTO.categories,
      );
    }
    // Transformes edit DTO to model storage layer.
    const vendorCreditModel =
      await this.vendorCreditDTOTransform.transformCreateEditDTOToModel(
        vendorCreditDTO,
        vendor.currencyCode,
        oldVendorCredit,
      );
    // Edits the vendor credit graph under unit-of-work envirement.
    return this.uow.withTransaction(async (trx) => {
      // Triggers `onVendorCreditEditing` event.
      await this.eventPublisher.emitAsync(events.vendorCredit.onEditing, {
        oldVendorCredit,
        vendorCreditDTO,
        trx,
      } as IVendorCreditEditingPayload);

      // Saves the vendor credit graph to the storage.
      const vendorCredit = await this.vendorCreditModel()
        .query(trx)
        .upsertGraphAndFetch({
          id: vendorCreditId,
          ...vendorCreditModel,
        });
      // Triggers `onVendorCreditEdited event.
      await this.eventPublisher.emitAsync(events.vendorCredit.onEdited, {
        oldVendorCredit,
        vendorCredit,
        vendorCreditDTO,
        trx,
      } as IVendorCreditEditedPayload);

      return vendorCredit;
    }, trx);
  };
}
