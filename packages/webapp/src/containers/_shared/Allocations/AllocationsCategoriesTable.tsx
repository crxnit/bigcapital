// @ts-nocheck
import React, { useCallback, useMemo } from 'react';
import intl from 'react-intl-universal';

import {
  DataTableEditable,
  AccountsListFieldCell,
  InputGroupCell,
  MoneyFieldCell,
} from '@/components';
import { ActionsCellRenderer } from '@/containers/Entries/components';
import { Align } from '@/constants';
import {
  saveInvoke,
  compose,
  updateTableCell,
  updateMinEntriesLines,
  updateAutoAddNewLine,
  updateRemoveLineByIndex,
} from '@/utils';
import { MIN_CATEGORY_LINES, makeDefaultAllocationCategory } from './utils';

/**
 * Shared direct-account allocations table for Bill / VendorCredit /
 * SaleInvoice / (soon) CreditNote forms. Each row is
 * `Account + Description + Amount`. Caller controls account-field name
 * (e.g. `expense_account_id` vs `income_account_id`) and the account
 * root-type filter (`expense` vs `income`).
 */
export default function AllocationsCategoriesTable({
  categories,
  error,
  onChange,
  currencyCode,
  accounts,
  accountField,
  accountRootType,
  tableName,
  minLines = MIN_CATEGORY_LINES,
}) {
  const defaultRow = useMemo(
    () => makeDefaultAllocationCategory(accountField),
    [accountField],
  );

  const columns = useMemo(
    () => [
      {
        Header: () => intl.get('account') || 'Account',
        id: accountField,
        accessor: accountField,
        Cell: AccountsListFieldCell,
        className: accountField,
        disableSortBy: true,
        width: 200,
        filterAccountsByRootTypes: [accountRootType],
        fieldProps: { allowCreate: true },
      },
      {
        Header: () => intl.get('description') || 'Description',
        accessor: 'description',
        Cell: InputGroupCell,
        disableSortBy: true,
        width: 200,
      },
      {
        Header: () => intl.get('amount') || 'Amount',
        accessor: 'amount',
        Cell: MoneyFieldCell,
        disableSortBy: true,
        width: 120,
        align: Align.Right,
        // Display as accounting format (two fixed decimals + group separators)
        // instead of bare integers. Use `displayDecimalLength`, NOT
        // `fixedDecimalLength` — the latter triggers cents-mode in the
        // underlying CurrencyInput library (typing "100" → blur → "1.00").
        // `displayDecimalLength` pads at render only.
        moneyInputGroupProps: { displayDecimalLength: 2 },
      },
      {
        Header: '',
        accessor: 'action',
        Cell: ActionsCellRenderer,
        disableSortBy: true,
        disableResizing: true,
        width: 45,
        align: Align.Center,
      },
    ],
    [accountField, accountRootType],
  );

  const handleUpdateData = useCallback(
    (rowIndex, columnId, value) => {
      const newRows = compose(
        updateAutoAddNewLine(defaultRow, [accountField]),
        updateTableCell(rowIndex, columnId, value),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [categories, onChange, defaultRow, accountField],
  );

  const handleRemoveRow = useCallback(
    (rowIndex) => {
      const newRows = compose(
        updateMinEntriesLines(minLines, defaultRow),
        updateRemoveLineByIndex(rowIndex),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [minLines, categories, onChange, defaultRow],
  );

  return (
    <DataTableEditable
      name={tableName}
      columns={columns}
      data={categories}
      sticky={true}
      payload={{
        accounts,
        errors: error,
        updateData: handleUpdateData,
        removeRow: handleRemoveRow,
        autoFocus: [accountField, 0],
        currencyCode,
      }}
    />
  );
}
