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
import { useBillFormContext } from './BillFormProvider';
import { defaultBillCategory, MIN_CATEGORY_LINES } from './utils';
import {
  saveInvoke,
  compose,
  updateTableCell,
  updateMinEntriesLines,
  updateAutoAddNewLine,
  updateRemoveLineByIndex,
} from '@/utils';

/**
 * Direct-account allocations table for the Bill form. Each row is
 * `Account + Description + Amount`. Lets a vendor bill carry expense
 * allocations without picking individual items, alongside (or instead of)
 * the existing items entries.
 */
export default function BillFormCategoriesTable({
  categories,
  error,
  onChange,
  currencyCode,
  minLines = MIN_CATEGORY_LINES,
}) {
  const { accounts } = useBillFormContext();

  const columns = useMemo(
    () => [
      {
        Header: () => intl.get('account') || 'Account',
        id: 'expense_account_id',
        accessor: 'expense_account_id',
        Cell: AccountsListFieldCell,
        className: 'expense_account_id',
        disableSortBy: true,
        width: 200,
        filterAccountsByRootTypes: ['expense'],
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
        // instead of bare integers. MoneyFieldCell now reads
        // `column.moneyInputGroupProps` as a default for every row.
        moneyInputGroupProps: { fixedDecimalLength: 2 },
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
    [],
  );

  const handleUpdateData = useCallback(
    (rowIndex, columnId, value) => {
      const newRows = compose(
        updateAutoAddNewLine(defaultBillCategory, ['expense_account_id']),
        updateTableCell(rowIndex, columnId, value),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [categories, onChange],
  );

  const handleRemoveRow = useCallback(
    (rowIndex) => {
      const newRows = compose(
        updateMinEntriesLines(minLines, defaultBillCategory),
        updateRemoveLineByIndex(rowIndex),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [minLines, categories, onChange],
  );

  return (
    <DataTableEditable
      name={'bill-categories'}
      columns={columns}
      data={categories}
      sticky={true}
      payload={{
        accounts,
        errors: error,
        updateData: handleUpdateData,
        removeRow: handleRemoveRow,
        autoFocus: ['expense_account_id', 0],
        currencyCode,
      }}
    />
  );
}
