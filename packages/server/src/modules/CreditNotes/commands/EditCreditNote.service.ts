import { Inject, Injectable } from '@nestjs/common';
import {
  ICreditNoteEditedPayload,
  ICreditNoteEditingPayload,
} from '../types/CreditNotes.types';
import { Knex } from 'knex';
import { CreditNote } from '../models/CreditNote';
import { Contact } from '../../Contacts/models/Contact';
import { ItemsEntriesService } from '../../Items/ItemsEntries.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnitOfWork } from '../../Tenancy/TenancyDB/UnitOfWork.service';
import { events } from '@/common/events/events';
import { CommandCreditNoteDTOTransform } from './CommandCreditNoteDTOTransform.service';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { EditCreditNoteDto } from '../dtos/CreditNote.dto';
import { Account } from '@/modules/Accounts/models/Account.model';
import { ACCOUNT_ROOT_TYPE } from '@/constants/accounts';
import {
  validateAllocationAtLeastOneLine,
  validateAllocationCategoryAccountsType,
} from '@/modules/_shared/allocations/AllocationCategory.helpers';
import { ERRORS } from '../constants';

@Injectable()
export class EditCreditNoteService {
  /**
   * @param {typeof CreditNote} creditNoteModel - The credit note model.
   * @param {typeof Contact} contactModel - The contact model.
   * @param {CommandCreditNoteDTOTransform} commandCreditNoteDTOTransform - The command credit note DTO transform service.
   * @param {ItemsEntriesService} itemsEntriesService - The items entries service.
   * @param {EventEmitter2} eventPublisher - The event publisher.
   * @param {UnitOfWork} uow - The unit of work.
   */
  constructor(
    @Inject(CreditNote.name)
    private creditNoteModel: TenantModelProxy<typeof CreditNote>,

    @Inject(Contact.name)
    private contactModel: TenantModelProxy<typeof Contact>,

    @Inject(Account.name)
    private accountModel: TenantModelProxy<typeof Account>,

    private commandCreditNoteDTOTransform: CommandCreditNoteDTOTransform,
    private itemsEntriesService: ItemsEntriesService,
    private eventPublisher: EventEmitter2,
    private uow: UnitOfWork,
  ) {}

  /**
   * Edits the given credit note.
   * @param {ICreditNoteEditDTO} creditNoteEditDTO -
   */
  public async editCreditNote(
    creditNoteId: number,
    creditNoteEditDTO: EditCreditNoteDto,
  ) {
    // Retrieve the sale invoice or throw not found service error.
    const oldCreditNote = await this.creditNoteModel()
      .query()
      .findById(creditNoteId)
      .throwIfNotFound();

    // Validate customer existance.
    const customer = await this.contactModel()
      .query()
      .findById(creditNoteEditDTO.customerId);

    // Credit notes may have no items entries (direct-account income
    // allocations only); pass an empty array so the shared validators
    // don't crash on undefined.
    const creditNoteEntries = creditNoteEditDTO.entries || [];

    validateAllocationAtLeastOneLine(
      creditNoteEntries,
      creditNoteEditDTO.categories,
      ERRORS.CREDIT_NOTE_NO_LINES,
    );

    // Validate items ids existance.
    await this.itemsEntriesService.validateItemsIdsExistance(creditNoteEntries);
    // Validate non-sellable entries items.
    await this.itemsEntriesService.validateNonSellableEntriesItems(
      creditNoteEntries,
    );
    // Validate the items entries existance.
    await this.itemsEntriesService.validateEntriesIdsExistance(
      creditNoteId,
      'CreditNote',
      creditNoteEntries,
    );
    // Validate direct-account allocation rows reference income-type accounts.
    if (
      creditNoteEditDTO.categories &&
      creditNoteEditDTO.categories.length > 0
    ) {
      await validateAllocationCategoryAccountsType(
        creditNoteEditDTO.categories,
        this.accountModel,
        {
          accountField: 'incomeAccountId',
          rootType: ACCOUNT_ROOT_TYPE.INCOME,
          errorCode: ERRORS.CREDIT_NOTE_CATEGORY_ACCOUNT_INVALID_TYPE,
        },
      );
    }
    // Transformes the given DTO to storage layer data.
    const creditNoteModel =
      await this.commandCreditNoteDTOTransform.transformCreateEditDTOToModel(
        creditNoteEditDTO,
        customer.currencyCode,
        oldCreditNote,
      );
    // Sales the credit note transactions with associated entries.
    return this.uow.withTransaction(async (trx: Knex.Transaction) => {
      // Triggers `onCreditNoteEditing` event.
      await this.eventPublisher.emitAsync(events.creditNote.onEditing, {
        creditNoteEditDTO,
        oldCreditNote,
        trx,
      } as ICreditNoteEditingPayload);

      // Saves the credit note graph to the storage.
      // `upsertGraphAndFetch` (not `upsertGraph`) so the emitted `creditNote`
      // carries the full row — incl. `openedAt`. The `onEdited` GL subscriber
      // gates on `isPublished` (= `!!openedAt`); a partial upsertGraph result
      // omits `openedAt` for already-published notes, making the gate falsy and
      // silently skipping the GL rewrite (stale ledger). Mirrors EditSaleInvoice.
      const creditNote = await this.creditNoteModel()
        .query(trx)
        .upsertGraphAndFetch({
          id: creditNoteId,
          ...creditNoteModel,
        });
      // Triggers `onCreditNoteEdited` event.
      await this.eventPublisher.emitAsync(events.creditNote.onEdited, {
        trx,
        oldCreditNote,
        creditNoteId,
        creditNote,
        creditNoteEditDTO,
      } as ICreditNoteEditedPayload);

      return creditNote;
    });
  }
}
