import React from 'react';
import intl from 'react-intl-universal';
import { MenuItem } from '@blueprintjs/core';
import { SelectOptionProps } from '@blueprintjs-formik/select';

// Shared account shape consumed by the account select/suggest/multi-select
// wrappers. Kept here (not in any single wrapper) so the three stay in sync.
export interface Account {
  id: number;
  name: string;
  code: string;
  account_level?: number;
  account_type?: string;
  account_parent_type?: string;
  account_root_type?: string;
  account_normal?: string;
}

// Option shape for the multi-select, which needs the Blueprint select option
// fields (label/value/text) in addition to the account fields.
export interface AccountSelect extends Partial<Account>, SelectOptionProps {}

// Filters accounts items by code/name. Optional fields are guarded so a
// partial option (e.g. a freshly-created item) never throws.
export const accountPredicate = (
  query: string,
  account: AccountSelect,
  _index?: number,
  exactMatch?: boolean,
): boolean => {
  const normalizedTitle = (account.name ?? '').toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (exactMatch) {
    return normalizedTitle === normalizedQuery;
  }
  return (
    `${account.code ?? ''} ${normalizedTitle}`.indexOf(normalizedQuery) >= 0
  );
};

// Renders the "Create '<query>'" menu item shown at the bottom of the account
// dropdowns when `allowCreate` is set. Identical across all three wrappers.
export const createNewItemRenderer = (
  query: string,
  active: boolean,
  handleClick: (event: React.MouseEvent<HTMLElement>) => void,
): React.ReactElement => (
  <MenuItem
    icon="add"
    text={intl.get('list.create', { value: `"${query}"` })}
    active={active}
    onClick={handleClick}
  />
);

// Minimal new-account item built from the typed query. Used by the single
// select and suggest fields; the multi-select needs a richer option shape
// (label/value/text) and builds its own.
export const createAccountFromQuery = (name: string): Partial<Account> => ({
  name,
});
