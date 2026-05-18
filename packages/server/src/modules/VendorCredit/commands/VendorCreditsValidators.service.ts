import { Inject, Injectable } from '@nestjs/common';
import { ServiceError } from '@/modules/Items/ServiceError';
import { Account } from '@/modules/Accounts/models/Account.model';
import { ACCOUNT_ROOT_TYPE } from '@/constants/accounts';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ERRORS } from '../constants';
import {
  VendorCreditEntryDto,
  VendorCreditExpenseCategoryDto,
} from '../dtos/VendorCredit.dto';

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
    const hasEntries = (entries || []).length > 0;
    const hasCategories = (categories || []).length > 0;
    if (!hasEntries && !hasCategories) {
      throw new ServiceError(ERRORS.VENDOR_CREDIT_NO_LINES);
    }
  }

  /**
   * Each direct-account allocation must point at an EXPENSE-root-type
   * account. Mirrors `validateBillCategoryAccountsType`.
   */
  public async validateCategoryAccountsType(
    categories: VendorCreditExpenseCategoryDto[],
  ) {
    const accountIds = Array.from(
      new Set(categories.map((c) => c.expenseAccountId).filter(Boolean)),
    );
    if (accountIds.length === 0) return;
    const accounts = await this.accountModel()
      .query()
      .whereIn('id', accountIds);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of accountIds) {
      const acc = byId.get(id);
      if (!acc || !acc.isRootType(ACCOUNT_ROOT_TYPE.EXPENSE)) {
        throw new ServiceError(
          ERRORS.VENDOR_CREDIT_CATEGORY_ACCOUNT_INVALID_TYPE,
        );
      }
    }
  }
}
