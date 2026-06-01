import React from 'react';
import { FMultiSelect } from '../Forms';
import {
  AccountSelect,
  accountPredicate,
  createNewItemRenderer,
} from './_components';
import { usePreprocessingAccounts } from './_hooks';
import { DialogsName } from '@/constants/dialogs';
import { useDialogActions } from '@/hooks/state/dashboard';

export type { AccountSelect } from './_components';

type MultiSelectProps = React.ComponentProps<typeof FMultiSelect>;

interface AccountsMultiSelectProps extends Omit<MultiSelectProps, 'items'> {
  items: AccountSelect[];
  allowCreate?: boolean;
  filterByRootTypes?: string[];
  filterByParentTypes?: string[];
  filterByTypes?: string[];
  filterByNormal?: string[];
  hideParentAccounts?: boolean;
}

// Create new item from the given query string. The multi-select needs the full
// Blueprint option shape (label/value/text), so it builds its own rather than
// using the shared `createAccountFromQuery`.
const createNewItemFromQuery = (query: string): AccountSelect => ({
  label: query,
  value: query,
  text: query,
  id: 0,
  name: query,
  code: query,
});

/**
 * Accounts multi-select field binded with Formik form.
 * @returns {JSX.Element}
 */
export function AccountsMultiSelect({
  items,
  allowCreate,

  filterByRootTypes,
  filterByParentTypes,
  filterByTypes,
  filterByNormal,
  hideParentAccounts,

  ...rest
}: AccountsMultiSelectProps): React.ReactElement {
  const { openDialog } = useDialogActions();

  // Filters accounts based on filter props.
  const filteredAccounts = usePreprocessingAccounts(items, {
    filterByParentTypes: filterByParentTypes || [],
    filterByTypes: filterByTypes || [],
    filterByNormal: filterByNormal || [],
    filterByRootTypes: filterByRootTypes || [],
    hideParentAccounts,
  });
  // Maybe inject new item props to select component.
  const maybeCreateNewItemRenderer = allowCreate
    ? createNewItemRenderer
    : undefined;
  const maybeCreateNewItemFromQuery = allowCreate
    ? createNewItemFromQuery
    : undefined;

  // Handles the create item click.
  const handleCreateItemClick = (): void => {
    openDialog(DialogsName.AccountForm);
  };

  return (
    <FMultiSelect
      {...rest}
      items={filteredAccounts}
      valueAccessor={'id'}
      textAccessor={'name'}
      labelAccessor={'code'}
      tagAccessor={'name'}
      popoverProps={{ minimal: true }}
      itemPredicate={accountPredicate}
      createNewItemRenderer={maybeCreateNewItemRenderer}
      createNewItemFromQuery={maybeCreateNewItemFromQuery}
      onCreateItemSelect={handleCreateItemClick}
    />
  );
}
