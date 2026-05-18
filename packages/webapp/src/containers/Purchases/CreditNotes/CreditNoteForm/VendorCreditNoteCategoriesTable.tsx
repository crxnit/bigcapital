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
import { useVendorCreditNoteFormContext } from './VendorCreditNoteFormProvider';
import { defaultVendorCreditCategory, MIN_CATEGORY_LINES } from './utils';
import {
  saveInvoke,
  compose,
  updateTableCell,
  updateMinEntriesLines,
  updateAutoAddNewLine,
  updateRemoveLineByIndex,
} from '@/utils';

/**
 * Direct-account allocations table for the Vendor Credit form. Each row is
 * `Account + Description + Amount`. Lets a vendor credit carry expense
 * reversals without picking individual items, alongside (or instead of) the
 * existing items entries. Mirrors BillFormCategoriesTable.
 */
export default function VendorCreditNoteCategoriesTable({
  categories,
  error,
  onChange,
  currencyCode,
  minLines = MIN_CATEGORY_LINES,
}) {
  const { accounts } = useVendorCreditNoteFormContext();

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
        updateAutoAddNewLine(defaultVendorCreditCategory, [
          'expense_account_id',
        ]),
        updateTableCell(rowIndex, columnId, value),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [categories, onChange],
  );

  const handleRemoveRow = useCallback(
    (rowIndex) => {
      const newRows = compose(
        updateMinEntriesLines(minLines, defaultVendorCreditCategory),
        updateRemoveLineByIndex(rowIndex),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [minLines, categories, onChange],
  );

  return (
    <DataTableEditable
      name={'vendor-credit-categories'}
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
