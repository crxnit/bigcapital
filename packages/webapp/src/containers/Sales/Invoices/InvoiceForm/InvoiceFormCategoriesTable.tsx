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
import { useInvoiceFormContext } from './InvoiceFormProvider';
import { defaultInvoiceCategory, MIN_CATEGORY_LINES } from './utils';
import {
  saveInvoke,
  compose,
  updateTableCell,
  updateMinEntriesLines,
  updateAutoAddNewLine,
  updateRemoveLineByIndex,
} from '@/utils';

/**
 * Direct-account income allocations table for the Invoice form. Each row
 * is `Account + Description + Amount`. Lets an invoice carry revenue
 * allocations without picking individual items, alongside (or instead of)
 * the existing items entries.
 */
export default function InvoiceFormCategoriesTable({
  categories,
  error,
  onChange,
  currencyCode,
  minLines = MIN_CATEGORY_LINES,
}) {
  const { accounts } = useInvoiceFormContext();

  const columns = useMemo(
    () => [
      {
        Header: () => intl.get('account') || 'Account',
        id: 'income_account_id',
        accessor: 'income_account_id',
        Cell: AccountsListFieldCell,
        className: 'income_account_id',
        disableSortBy: true,
        width: 200,
        filterAccountsByRootTypes: ['income'],
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
    [],
  );

  const handleUpdateData = useCallback(
    (rowIndex, columnId, value) => {
      const newRows = compose(
        updateAutoAddNewLine(defaultInvoiceCategory, ['income_account_id']),
        updateTableCell(rowIndex, columnId, value),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [categories, onChange],
  );

  const handleRemoveRow = useCallback(
    (rowIndex) => {
      const newRows = compose(
        updateMinEntriesLines(minLines, defaultInvoiceCategory),
        updateRemoveLineByIndex(rowIndex),
      )(categories);
      saveInvoke(onChange, newRows);
    },
    [minLines, categories, onChange],
  );

  return (
    <DataTableEditable
      name={'invoice-categories'}
      columns={columns}
      data={categories}
      sticky={true}
      payload={{
        accounts,
        errors: error,
        updateData: handleUpdateData,
        removeRow: handleRemoveRow,
        autoFocus: ['income_account_id', 0],
        currencyCode,
      }}
    />
  );
}
