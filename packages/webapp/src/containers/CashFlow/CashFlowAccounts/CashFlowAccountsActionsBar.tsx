// @ts-nocheck
import {
  Button,
  NavbarGroup,
  Classes,
  NavbarDivider,
  Alignment,
  Switch,
  Menu,
  MenuItem,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
  DashboardActionsBar,
  Can,
  Icon,
  FormattedMessage as T,
  FeatureCan,
} from '@/components';
import { useRefreshCashflowAccounts } from '@/hooks/query';
import { useOpenPlaidConnect } from '@/hooks/utils/useOpenPlaidConnect';
import { CashflowAction, AbilitySubject } from '@/constants/abilityOption';

import { withDialogActions } from '@/containers/Dialog/withDialogActions';
import { withCashflowAccounts } from '../AccountTransactions/withCashflowAccounts';
import { withCashflowAccountsTableActions } from '../AccountTransactions/withCashflowAccountsTableActions';

import { AccountDialogAction } from '@/containers/Dialogs/AccountDialog/utils';

import { ACCOUNT_TYPE, Features } from '@/constants';
import { DialogsName } from '@/constants/dialogs';
import { CreditCard2Icon } from '@/icons/CreditCard2';

import { compose } from '@/utils';

/**
 * Sort options for the bank-account cards. `id` is the model field key the
 * server's dynamic-list sorter expects (see `Account.meta` fields), `desc`
 * the direction.
 */
const CASHFLOW_ACCOUNTS_SORT_OPTIONS = [
  { id: 'name', desc: false, label: 'Name (A–Z)' },
  { id: 'name', desc: true, label: 'Name (Z–A)' },
  { id: 'code', desc: false, label: 'Code (Ascending)' },
  { id: 'code', desc: true, label: 'Code (Descending)' },
  { id: 'balance', desc: true, label: 'Balance (High–Low)' },
  { id: 'balance', desc: false, label: 'Balance (Low–High)' },
  { id: 'created_at', desc: true, label: 'Newest First' },
  { id: 'created_at', desc: false, label: 'Oldest First' },
];

const isSameSort = (option, sortBy) =>
  Array.isArray(sortBy) &&
  sortBy.length > 0 &&
  sortBy[0].id === option.id &&
  Boolean(sortBy[0].desc) === option.desc;

/**
 * Cash Flow accounts actions bar.
 */
function CashFlowAccountsActionsBar({
  // #withDialogActions
  openDialog,

  // #withCashflowAccounts
  cashflowAccountsTableState,

  // #withCashflowAccountsTableActions
  setCashflowAccountsTableState,
}) {
  const { refresh } = useRefreshCashflowAccounts();

  // Opens the Plaid popup.
  const { openPlaidAsync, isPlaidLoading } = useOpenPlaidConnect();

  // Handle refresh button click.
  const handleRefreshBtnClick = () => {
    refresh();
  };
  // Handle add cash account.
  const handleAddCashAccount = () => {
    openDialog(DialogsName.AccountForm, {
      action: AccountDialogAction.NewDefinedType,
      accountType: ACCOUNT_TYPE.CASH,
    });
  };
  // Handle add bank account.
  const handleAddBankAccount = () => {
    openDialog(DialogsName.AccountForm, {
      action: AccountDialogAction.NewDefinedType,
      accountType: ACCOUNT_TYPE.BANK,
    });
  };
  // Handle inactive switch changing.
  const handleInactiveSwitchChange = (event) => {
    const checked = event.target.checked;
    setCashflowAccountsTableState({ inactiveMode: checked });
  };
  // Handle connect button click.
  const handleConnectToBank = () => {
    openPlaidAsync();
  };
  // Handle sort option click.
  const handleSortOptionClick = (option) => {
    setCashflowAccountsTableState({
      sortBy: [{ id: option.id, desc: option.desc }],
    });
  };

  const sortBy = cashflowAccountsTableState?.sortBy;
  const activeSortOption =
    CASHFLOW_ACCOUNTS_SORT_OPTIONS.find((option) =>
      isSameSort(option, sortBy),
    ) || CASHFLOW_ACCOUNTS_SORT_OPTIONS[0];

  const sortMenu = (
    <Menu>
      {CASHFLOW_ACCOUNTS_SORT_OPTIONS.map((option) => (
        <MenuItem
          key={`${option.id}-${option.desc}`}
          text={option.label}
          icon={isSameSort(option, sortBy) ? 'small-tick' : 'blank'}
          onClick={() => handleSortOptionClick(option)}
        />
      ))}
    </Menu>
  );

  return (
    <DashboardActionsBar>
      <NavbarGroup>
        <Can I={CashflowAction.Create} a={AbilitySubject.Cashflow}>
          <Button
            className={Classes.MINIMAL}
            icon={<Icon icon={'plus-24'} iconSize={20} />}
            text={<T id={'banking.label.add_cash_account'} />}
            onClick={handleAddCashAccount}
          />
          <Button
            className={Classes.MINIMAL}
            icon={<Icon icon={'plus-24'} iconSize={20} />}
            text={<T id={'banking.label.add_bank_account'} />}
            onClick={handleAddBankAccount}
          />
          <NavbarDivider />
        </Can>
        <NavbarDivider />
        <Can I={CashflowAction.Edit} a={AbilitySubject.Cashflow}>
          <Switch
            labelElement={<T id={'inactive'} />}
            defaultChecked={false}
            onChange={handleInactiveSwitchChange}
          />
        </Can>
      </NavbarGroup>

      <NavbarGroup align={Alignment.RIGHT}>
        <Popover2 content={sortMenu} placement="bottom-end">
          <Button
            className={Classes.MINIMAL}
            icon={<Icon icon="sort-down" iconSize={16} />}
            rightIcon={<Icon icon="caret-down-16" iconSize={16} />}
            text={`Sort: ${activeSortOption.label}`}
          />
        </Popover2>
        <NavbarDivider />
        <FeatureCan feature={Features.BankSyncing}>
          <Button
            className={Classes.MINIMAL}
            text={'Connect Bank/Credit Card'}
            icon={<CreditCard2Icon />}
            onClick={handleConnectToBank}
            disabled={isPlaidLoading}
          />
          <NavbarDivider />
        </FeatureCan>
        <Button
          className={Classes.MINIMAL}
          icon={<Icon icon="refresh-16" iconSize={14} />}
          onClick={handleRefreshBtnClick}
        />
      </NavbarGroup>
    </DashboardActionsBar>
  );
}
export default compose(
  withDialogActions,
  withCashflowAccounts(({ cashflowAccountsTableState }) => ({
    cashflowAccountsTableState,
  })),
  withCashflowAccountsTableActions,
)(CashFlowAccountsActionsBar);
