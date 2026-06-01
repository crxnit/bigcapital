import { Injectable } from '@nestjs/common';
import { omit, sumBy } from 'lodash';
import * as moment from 'moment';
import * as composeAsync from 'async/compose';
import * as R from 'ramda';
import { ERRORS } from '../constants';
import { ServiceError } from '@/modules/Items/ServiceError';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { BranchTransactionDTOTransformer } from '@/modules/Branches/integrations/BranchTransactionDTOTransform';
import { WarehouseTransactionDTOTransform } from '@/modules/Warehouses/Integrations/WarehouseTransactionDTOTransform';
import { BrandingTemplateDTOTransformer } from '../../PdfTemplate/BrandingTemplateDTOTransformer';
import { assocItemEntriesDefaultIndex } from '@/utils/associate-item-entries-index';
import { formatDateFields } from '@/utils/format-date-fields';
import { CreditNoteAutoIncrementService } from './CreditNoteAutoIncrement.service';
import { CreditNote } from '../models/CreditNote';
import {
  CreateCreditNoteDto,
  CreditNoteEntryDto,
  EditCreditNoteDto,
} from '../dtos/CreditNote.dto';
import { normalizeAllocationCategories } from '@/modules/_shared/allocations/AllocationCategory.helpers';

@Injectable()
export class CommandCreditNoteDTOTransform {
  /**
   * @param {ItemsEntriesService} itemsEntriesService - The items entries service.
   * @param {BranchTransactionDTOTransformer} branchDTOTransform - The branch transaction DTO transformer.
   * @param {WarehouseTransactionDTOTransform} warehouseDTOTransform - The warehouse transaction DTO transformer.
   * @param {BrandingTemplateDTOTransformer} brandingTemplatesTransformer - The branding template DTO transformer.
   * @param {CreditNoteAutoIncrementService} creditNoteAutoIncrement - The credit note auto increment service.
   */
  constructor(
    private readonly itemsEntriesService: ItemsEntriesService,
    private readonly branchDTOTransform: BranchTransactionDTOTransformer,
    private readonly warehouseDTOTransform: WarehouseTransactionDTOTransform,
    private readonly brandingTemplatesTransformer: BrandingTemplateDTOTransformer,
    private readonly creditNoteAutoIncrement: CreditNoteAutoIncrementService,
  ) {}

  /**
   * Transforms the credit/edit DTO to model.
   * @param {ICreditNoteNewDTO | ICreditNoteEditDTO} creditNoteDTO
   * @param {string} customerCurrencyCode -
   */
  public transformCreateEditDTOToModel = async (
    creditNoteDTO: CreateCreditNoteDto | EditCreditNoteDto,
    customerCurrencyCode: string,
    oldCreditNote?: CreditNote,
  ): Promise<CreditNote> => {
    const dtoEntries = creditNoteDTO.entries || [];

    // Calculates the total amount of items entries.
    const itemsTotal =
      this.itemsEntriesService.getTotalItemsEntries(dtoEntries);
    const categories = normalizeAllocationCategories(creditNoteDTO.categories, {
      accountField: 'incomeAccountId',
    });
    const categoriesTotal = sumBy(categories, (c) => Number(c.amount) || 0);
    // `amount` stores the credit note's gross balance; direct-account
    // category allocations add to this alongside the items entries total.
    const amount = itemsTotal + categoriesTotal;

    const entries = R.compose(
      // Associate the default index to each item entry.
      assocItemEntriesDefaultIndex,

      // Associate the reference type to credit note entries.
      R.map((entry: CreditNoteEntryDto) => ({
        ...entry,
        referenceType: 'CreditNote',
      })),
    )(dtoEntries);

    // Retrieves the next credit note number.
    const autoNextNumber =
      await this.creditNoteAutoIncrement.getNextCreditNumber();

    // Determines the credit note number.
    const creditNoteNumber =
      creditNoteDTO.creditNoteNumber ||
      oldCreditNote?.creditNoteNumber ||
      autoNextNumber;

    const initialDTO = {
      ...formatDateFields(
        omit(creditNoteDTO, ['open', 'attachments', 'categories']),
        ['creditNoteDate'],
      ),
      creditNoteNumber,
      amount,
      currencyCode: customerCurrencyCode,
      exchangeRate: creditNoteDTO.exchangeRate || 1,
      entries,
      categories,
      ...(creditNoteDTO.open &&
        !oldCreditNote?.openedAt && {
          openedAt: moment().toMySqlDateTime(),
        }),
      refundedAmount: 0,
      invoicesAmount: 0,
    };
    const asyncDto = (await composeAsync(
      this.branchDTOTransform.transformDTO<CreditNote>,
      this.warehouseDTOTransform.transformDTO<CreditNote>,

      // Assigns the default branding template id to the invoice DTO.
      this.brandingTemplatesTransformer.assocDefaultBrandingTemplate(
        'CreditNote',
      ),
    )(initialDTO)) as CreditNote;

    return asyncDto;
  };

  /**
   * Validate the credit note remaining amount.
   * @param {ICreditNote} creditNote
   * @param {number} amount
   */
  public validateCreditRemainingAmount = (
    creditNote: CreditNote,
    amount: number,
  ) => {
    if (creditNote.creditsRemaining < amount) {
      throw new ServiceError(ERRORS.CREDIT_NOTE_HAS_NO_REMAINING_AMOUNT);
    }
  };
}
