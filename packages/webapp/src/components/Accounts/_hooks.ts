import { useMemo } from 'react';
import { filterAccountsByQuery, nestedArrayToflatten } from '@/utils';

interface PreprocessingAccountsOptions {
  filterByRootTypes: string[];
  filterByParentTypes: string[];
  filterByTypes: string[];
  filterByNormal: string[];
  // Hide parent accounts (grouping/subtotal headers). They cannot be posted
  // to — enforced server-side in `LedgerEntriesStorageService` — so the
  // transaction account pickers omit them. Defaults to `true`; pass `false`
  // where selecting a parent is legitimate (the Account dialog's "Parent
  // Account" field, report account filters).
  hideParentAccounts?: boolean;
}

// An account is a "parent" iff another account references it as its parent.
// The response serializer snake-cases keys (`parent_account_id`), but read
// the camelCase form too so this is robust to whichever shape the payload has.
const getParentAccountsIds = (accounts: any[]): Set<number> =>
  new Set(
    accounts
      .map((account) => account?.parent_account_id ?? account?.parentAccountId)
      .filter((id) => id !== null && id !== undefined),
  );

export const usePreprocessingAccounts = (
  items: any,
  {
    filterByRootTypes,
    filterByParentTypes,
    filterByTypes,
    filterByNormal,
    hideParentAccounts = true,
  }: PreprocessingAccountsOptions,
) => {
  return useMemo(() => {
    const flattenAccounts = nestedArrayToflatten(items);
    let filteredAccounts = filterAccountsByQuery(flattenAccounts, {
      filterByRootTypes,
      filterByParentTypes,
      filterByTypes,
      filterByNormal,
    });
    if (hideParentAccounts) {
      // Derive the parent set from the full (unfiltered) list so an account
      // is recognized as a parent regardless of the active type filters.
      const parentAccountsIds = getParentAccountsIds(flattenAccounts);
      filteredAccounts = filteredAccounts.filter(
        (account: any) => !parentAccountsIds.has(account.id),
      );
    }
    return filteredAccounts;
  }, [
    items,
    filterByRootTypes,
    filterByParentTypes,
    filterByTypes,
    filterByNormal,
    hideParentAccounts,
  ]);
};
