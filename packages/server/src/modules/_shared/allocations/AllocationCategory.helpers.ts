import { ServiceError } from '@/modules/Items/ServiceError';
import { ACCOUNT_ROOT_TYPE } from '@/constants/accounts';
import { AccountNormal } from '@/modules/Accounts/Accounts.types';
import { Account } from '@/modules/Accounts/models/Account.model';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { ILedgerEntry } from '@/modules/Ledger/types/Ledger.types';

/**
 * Shared helpers for the "direct-account allocations" pattern shared by
 * Bill, VendorCredit, SaleInvoice, and (soon) CreditNote. Each parent
 * transaction can carry a list of category rows that contribute to its
 * total and emit one GL leg per row against a chosen account.
 *
 * The four call sites differ only along three axes:
 *   - the FK column name on the row (`expenseAccountId` / `incomeAccountId`)
 *   - the account root type required (`EXPENSE` / `INCOME`)
 *   - the GL leg side (`debit` / `credit`) and `accountNormal`
 *
 * These helpers parameterize all three so a new caller is one entry per
 * helper, not a fresh ~50-line normalize/validate/GL clone.
 */

type AccountRootType =
  (typeof ACCOUNT_ROOT_TYPE)[keyof typeof ACCOUNT_ROOT_TYPE];

export interface AllocationCategoryRow {
  id?: number;
  index?: number;
  description?: string | null;
  amount: number | string;
  [key: string]: any;
}

/**
 * Drops empty rows (missing account or non-positive amount), preserves
 * `id` on edit so `upsertGraph` updates in place rather than
 * delete+reinsert, and normalises types.
 */
export function normalizeAllocationCategories(
  categories: AllocationCategoryRow[] | undefined,
  options: { accountField: string },
): Array<AllocationCategoryRow> {
  const { accountField } = options;
  return (categories || [])
    .filter((c) => c && c[accountField] != null && Number(c.amount) > 0)
    .map((c, i) => ({
      ...(c.id != null ? { id: c.id } : {}),
      index: c.index ?? i + 1,
      [accountField]: c[accountField],
      description: c.description ?? '',
      amount: Number(c.amount) || 0,
    }));
}

/**
 * A parent transaction must carry at least one items entry OR one direct-
 * account allocation. Empty submissions are rejected with the supplied
 * error code (so each caller can keep its own typed ERRORS enum).
 */
export function validateAllocationAtLeastOneLine(
  entries: unknown[] | undefined,
  categories: unknown[] | undefined,
  errorCode: string,
): void {
  const hasEntries = (entries || []).length > 0;
  const hasCategories = (categories || []).length > 0;
  if (!hasEntries && !hasCategories) {
    throw new ServiceError(errorCode);
  }
}

/**
 * Each direct-account allocation must point at an account whose root
 * type matches the parent's domain (EXPENSE for bills/vendor-credits,
 * INCOME for invoices/credit-notes). One round-trip to the DB regardless
 * of row count.
 */
export async function validateAllocationCategoryAccountsType(
  categories: AllocationCategoryRow[],
  accountModel: TenantModelProxy<typeof Account>,
  options: {
    accountField: string;
    rootType: AccountRootType;
    errorCode: string;
  },
): Promise<void> {
  const { accountField, rootType, errorCode } = options;
  const accountIds = Array.from(
    new Set(categories.map((c) => c[accountField]).filter(Boolean)),
  );
  if (accountIds.length === 0) return;

  const accounts = await accountModel().query().whereIn('id', accountIds);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const id of accountIds) {
    const acc = byId.get(id);
    if (!acc || !acc.isRootType(rootType)) {
      throw new ServiceError(errorCode);
    }
  }
}

/**
 * Maps direct-account allocation rows to GL ledger entries. One leg per
 * row against the row's chosen account, base-currency amount =
 * `row.amount × exchangeRate`. `indexGroup` defaults to 15 — sits between
 * item entries (10) and tax/landed-cost/discount blocks (20+) so category
 * lines render in the middle of the journal view.
 */
export function mapAllocationLedgerEntries(
  categories: AllocationCategoryRow[] | undefined,
  options: {
    accountField: string;
    side: 'debit' | 'credit';
    accountNormal: AccountNormal;
    commonEntry: Partial<ILedgerEntry>;
    exchangeRate: number;
    indexGroup?: number;
  },
): ILedgerEntry[] {
  const {
    accountField,
    side,
    accountNormal,
    commonEntry,
    exchangeRate,
    indexGroup = 15,
  } = options;
  return (categories || []).map((category, index) => {
    const localAmount = (Number(category.amount) || 0) * exchangeRate;
    return {
      ...commonEntry,
      [side]: localAmount,
      accountId: category[accountField] as number,
      accountNormal,
      note: category.description ?? undefined,
      index: index + 1,
      indexGroup,
    } as ILedgerEntry;
  });
}
