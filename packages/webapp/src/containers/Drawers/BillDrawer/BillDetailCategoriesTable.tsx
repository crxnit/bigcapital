// @ts-nocheck
import React from 'react';

import { CommercialDocEntriesTable } from '@/components';

import { useBillDrawerContext } from './BillDrawerProvider';
import { useBillReadonlyCategoriesTableColumns } from './utils';

import { TableStyle } from '@/constants';

/**
 * Read-only table that shows a bill's direct-account allocations
 * (`bill_expense_categories` rows). Rendered below the items-entries
 * table when the bill has any categories — hidden otherwise so existing
 * bills without categories look unchanged.
 */
export default function BillDetailCategoriesTable() {
  const {
    bill: { categories },
  } = useBillDrawerContext();

  const columns = useBillReadonlyCategoriesTableColumns();

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <CommercialDocEntriesTable
      columns={columns}
      data={categories}
      styleName={TableStyle.Constrant}
    />
  );
}
