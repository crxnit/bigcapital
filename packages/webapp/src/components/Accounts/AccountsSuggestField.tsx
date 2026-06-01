import React, { useCallback, ComponentType } from 'react';
import intl from 'react-intl-universal';
import { MenuItem } from '@blueprintjs/core';
import { ItemRenderer } from '@blueprintjs/select';
import { DialogsName } from '@/constants/dialogs';
import { FSuggest, Suggest, FormattedMessage as T } from '@/components';
import { withDialogActions } from '@/containers/Dialog/withDialogActions';
import { usePreprocessingAccounts } from './_hooks';
import {
  Account,
  accountPredicate,
  createNewItemRenderer,
  createAccountFromQuery as createNewItemFromQuery,
} from './_components';

// Types for renderers
type AccountItemRenderer = ItemRenderer<Account>;

// Account item renderer for Suggest (non-Formik)
const accountItemRenderer: AccountItemRenderer = (
  item: Account,
  { handleClick, modifiers },
): React.ReactElement | null => {
  if (!modifiers.matchesPredicate) {
    return null;
  }
  return (
    <MenuItem
      active={modifiers.active}
      disabled={modifiers.disabled}
      label={item.code}
      key={item.id}
      text={item.name}
      onClick={handleClick}
    />
  );
};

// Input value renderer for Suggest (non-Formik)
const inputValueRenderer = (item: Account | null): string => {
  if (item) {
    return item.name || '';
  }
  return '';
};

// Props specific to the HOC (excluding component's own props)
interface AccountsSuggestFieldOwnProps {
  // #withDialogActions
  openDialog: (name: string, payload?: any) => void;

  // #ownProps
  items: Account[];
  defaultSelectText?: string;
  filterByParentTypes?: string[];
  filterByTypes?: string[];
  filterByNormal?: string[];
  filterByRootTypes?: string[];
  hideParentAccounts?: boolean;
  allowCreate?: boolean;
}

// Props that the HOC provides to the wrapped component (should be omitted from external props)
type ProvidedSuggestProps =
  | 'items'
  | 'itemPredicate'
  | 'onCreateItemSelect'
  | 'valueAccessor'
  | 'textAccessor'
  | 'labelAccessor'
  | 'resetOnClose'
  | 'createNewItemRenderer'
  | 'createNewItemFromQuery';

// Utility type to extract props from a component
type ComponentProps<C> = C extends ComponentType<infer P> ? P : never;

/**
 * HOC for Accounts Suggest Field logic.
 * Returns a component that accepts the wrapped component's props minus the ones provided by the HOC.
 */
function withAccountsSuggestFieldLogic<C extends ComponentType<any>>(
  Component: C,
): ComponentType<
  AccountsSuggestFieldOwnProps & Omit<ComponentProps<C>, ProvidedSuggestProps>
> {
  return function AccountsSuggestFieldLogic({
    // #withDialogActions
    openDialog,

    // #ownProps
    items,
    defaultSelectText = intl.formatMessage({ id: 'select_account' }),

    filterByParentTypes = [],
    filterByTypes = [],
    filterByNormal = [],
    filterByRootTypes = [],
    hideParentAccounts,

    allowCreate,

    // SuggestProps - props that will be passed to Suggest/FSuggest
    ...suggestProps
  }: AccountsSuggestFieldOwnProps &
    Omit<ComponentProps<C>, ProvidedSuggestProps>) {
    const filteredAccounts = usePreprocessingAccounts(items, {
      filterByParentTypes,
      filterByTypes,
      filterByNormal,
      filterByRootTypes,
      hideParentAccounts,
    });
    const handleCreateItemSelect = useCallback(
      (item: Account | Partial<Account>) => {
        if (!('id' in item) || !item.id) {
          openDialog(DialogsName.AccountForm);
        }
      },
      [openDialog],
    );
    // Maybe inject new item props to select component.
    const maybeCreateNewItemRenderer = allowCreate
      ? createNewItemRenderer
      : undefined;
    const maybeCreateNewItemFromQuery = allowCreate
      ? createNewItemFromQuery
      : undefined;

    // Build the SuggestProps to pass to the component
    const processedSuggestProps = {
      items: filteredAccounts,
      itemPredicate: accountPredicate,
      onCreateItemSelect: handleCreateItemSelect,
      valueAccessor: 'id' as const,
      textAccessor: 'name' as const,
      labelAccessor: 'code' as const,
      inputProps: { placeholder: defaultSelectText },
      resetOnClose: true,
      popoverProps: { minimal: true, boundary: 'window' as const },
      createNewItemRenderer: maybeCreateNewItemRenderer,
      createNewItemFromQuery: maybeCreateNewItemFromQuery,
      ...suggestProps,
    } as ComponentProps<C>;

    return <Component {...processedSuggestProps} />;
  };
}
const AccountsSuggestFieldWithLogic = withAccountsSuggestFieldLogic(Suggest);
const FAccountsSuggestFieldWithLogic = withAccountsSuggestFieldLogic(FSuggest);

export const AccountsSuggestField = withDialogActions(
  AccountsSuggestFieldWithLogic,
);
export const FAccountsSuggestField = withDialogActions(
  FAccountsSuggestFieldWithLogic,
);
