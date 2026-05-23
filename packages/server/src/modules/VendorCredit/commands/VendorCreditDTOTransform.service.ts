import * as moment from 'moment';
import { omit } from 'lodash';
import * as R from 'ramda';
import * as composeAsync from 'async/compose';
import { ERRORS } from '../constants';
import { ItemsEntriesService } from '@/modules/Items/ItemsEntries.service';
import { BranchTransactionDTOTransformer } from '@/modules/Branches/integrations/BranchTransactionDTOTransform';
import { WarehouseTransactionDTOTransform } from '@/modules/Warehouses/Integrations/WarehouseTransactionDTOTransform';
import { VendorCredit } from '../models/VendorCredit';
import { assocItemEntriesDefaultIndex } from '@/utils/associate-item-entries-index';
import { formatDateFields } from '@/utils/format-date-fields';
import { VendorCreditAutoIncrementService } from './VendorCreditAutoIncrement.service';
import { ServiceError } from '@/modules/Items/ServiceError';
import { Injectable } from '@nestjs/common';
import {
  CreateVendorCreditDto,
  EditVendorCreditDto,
  VendorCreditEntryDto,
} from '../dtos/VendorCredit.dto';
import { normalizeAllocationCategories } from '@/modules/_shared/allocations/AllocationCategory.helpers';

@Injectable()
export class VendorCreditDTOTransformService {
  /**
   * @param {ItemsEntriesService} itemsEntriesService - The items entries service.
   * @param {BranchTransactionDTOTransformer} branchDTOTransform - The branch transaction DTO transformer.
   * @param {WarehouseTransactionDTOTransform} warehouseDTOTransform - The warehouse transaction DTO transformer.
   * @param {VendorCreditAutoIncrementService} vendorCreditAutoIncrement - The vendor credit auto increment service.
   */
  constructor(
    private itemsEntriesService: ItemsEntriesService,
    private branchDTOTransform: BranchTransactionDTOTransformer,
    private warehouseDTOTransform: WarehouseTransactionDTOTransform,
    private vendorCreditAutoIncrement: VendorCreditAutoIncrementService,
  ) {}

  /**
   * Transforms the credit/edit vendor credit DTO to model.
   * @param {IVendorCreditCreateDTO | IVendorCreditEditDTO} vendorCreditDTO
   * @param {string} vendorCurrencyCode -
   * @param {IVendorCredit} oldVendorCredit -
   * @returns {VendorCredit}
   */
  public transformCreateEditDTOToModel = async (
    vendorCreditDTO: CreateVendorCreditDto | EditVendorCreditDto,
    vendorCurrencyCode: string,
    oldVendorCredit?: VendorCredit,
  ): Promise<VendorCredit> => {
    const dtoEntries = vendorCreditDTO.entries || [];

    // Calculates the total amount of items entries.
    const itemsTotal =
      this.itemsEntriesService.getTotalItemsEntries(dtoEntries);
    const categories = normalizeAllocationCategories(
      vendorCreditDTO.categories,
      { accountField: 'expenseAccountId' },
    );
    const categoriesTotal = categories.reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0,
    );
    // `amount` stores the credit's gross balance at creation; direct-account
    // allocations add to this alongside the items entries total.
    const amount = itemsTotal + categoriesTotal;

    const entries = R.compose(
      // Associate the default index to each item entry.
      assocItemEntriesDefaultIndex,

      // Associate the reference type to item entries.
      R.map((entry: VendorCreditEntryDto) => ({
        referenceType: 'VendorCredit',
        ...entry,
      })),
    )(dtoEntries);

    // Retreive the next vendor credit number.
    const autoNextNumber =
      await this.vendorCreditAutoIncrement.getNextCreditNumber();

    // Detarmines the credit note number.
    const vendorCreditNumber =
      vendorCreditDTO.vendorCreditNumber ||
      oldVendorCredit?.vendorCreditNumber ||
      autoNextNumber;

    const initialDTO = {
      ...formatDateFields(
        omit(vendorCreditDTO, ['open', 'attachments', 'categories']),
        ['vendorCreditDate'],
      ),
      amount,
      currencyCode: vendorCurrencyCode,
      exchangeRate: vendorCreditDTO.exchangeRate || 1,
      vendorCreditNumber,
      entries,
      categories,
      ...(vendorCreditDTO.open &&
        !oldVendorCredit?.openedAt && {
          openedAt: moment().toMySqlDateTime(),
        }),
    };
    return composeAsync(
      this.branchDTOTransform.transformDTO<VendorCredit>,
      this.warehouseDTOTransform.transformDTO<VendorCredit>,
    )(initialDTO) as VendorCredit;
  };

  /**
   * Validate the credit note remaining amount.
   * @param {ICreditNote} creditNote
   * @param {number} amount
   */
  public validateCreditRemainingAmount = (
    vendorCredit: VendorCredit,
    amount: number,
  ) => {
    if (vendorCredit.creditsRemaining < amount) {
      throw new ServiceError(ERRORS.VENDOR_CREDIT_HAS_NO_REMAINING_AMOUNT);
    }
  };
}
