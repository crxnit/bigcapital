// @ts-nocheck
import React from 'react';
import { DashboardPageContent } from '@/components';

import '@/style/pages/Bills/List.scss';

import { BillsListProvider } from './BillsListProvider';

import BillsActionsBar from './BillsActionsBar';
import BillsTable from './BillsTable';

import { withBills } from './withBills';

import { transformTableStateToQuery, compose } from '@/utils';

/**
 * Bills list.
 */
function BillsList({
  // #withBills
  billsTableState,
  billsTableStateChanged,
}) {
  // The bills table state (sort, page, filters) is intentionally NOT reset on
  // unmount, so editing a bill and navigating back returns to the same
  // sort/position. The chosen sort is persisted across reloads; other state
  // falls back to the default (oldest-first by bill date).

  return (
    <BillsListProvider
      query={transformTableStateToQuery(billsTableState)}
      tableStateChanged={billsTableStateChanged}
    >
      <BillsActionsBar />

      <DashboardPageContent>
        <BillsTable />
      </DashboardPageContent>
    </BillsListProvider>
  );
}

export default compose(
  withBills(({ billsTableState, billsTableStateChanged }) => ({
    billsTableState,
    billsTableStateChanged,
  })),
)(BillsList);
