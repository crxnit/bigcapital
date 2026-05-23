import { Inject, Injectable } from '@nestjs/common';
import { Account } from '@/modules/Accounts/models/Account.model';
import { ACCOUNT_ROOT_TYPE } from '@/constants/accounts';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ERRORS } from '../constants';
import {
  VendorCreditEntryDto,
  VendorCreditExpenseCategoryDto,
} from '../dtos/VendorCredit.dto';
import {
  validateAllocationAtLeastOneLine,
  validateAllocationCategoryAccountsType,
} from '@/modules/_shared/allocations/AllocationCategory.helpers';

@Injectable()
export class VendorCreditsValidators {
  constructor(
    @Inject(Account.name)
    private accountModel: TenantModelProxy<typeof Account>,
  ) {}

  /**
   * A vendor credit must carry at least one items entry OR one
   * direct-account allocation. Empty credits are rejected.
   */
  public validateAtLeastOneLine(
    entries: VendorCreditEntryDto[] | undefined,
    categories: VendorCreditExpenseCategoryDto[] | undefined,
  ) {
    validateAllocationAtLeastOneLine(
      entries,
      categories,
      ERRORS.VENDOR_CREDIT_NO_LINES,
    );
  }

  /**
   * Each direct-account allocation must point at an EXPENSE-root-type
   * account.
   */
  public async validateCategoryAccountsType(
    categories: VendorCreditExpenseCategoryDto[],
  ) {
    await validateAllocationCategoryAccountsType(
      categories,
      this.accountModel,
      {
        accountField: 'expenseAccountId',
        rootType: ACCOUNT_ROOT_TYPE.EXPENSE,
        errorCode: ERRORS.VENDOR_CREDIT_CATEGORY_ACCOUNT_INVALID_TYPE,
      },
    );
  }
}
