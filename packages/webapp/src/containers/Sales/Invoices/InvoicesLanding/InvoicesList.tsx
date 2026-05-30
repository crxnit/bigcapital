// @ts-nocheck
import React from 'react';

import '@/style/pages/SaleInvoice/List.scss';

import { DashboardPageContent } from '@/components';
import { InvoicesListProvider } from './InvoicesListProvider';

import InvoicesDataTable from './InvoicesDataTable';
import InvoicesActionsBar from './InvoicesActionsBar';

import { withInvoices } from './withInvoices';
import { withAlertActions } from '@/containers/Alert/withAlertActions';

import { transformTableStateToQuery, compose } from '@/utils';

/**
 * Sale invoices list.
 */
function InvoicesList({
  // #withInvoice
  invoicesTableState,
  invoicesTableStateChanged,
}) {
  // The invoices table state (sort, page, filters) is intentionally NOT reset
  // on unmount, so editing an invoice from the row popup and navigating back
  // returns to the same sort/position. The chosen sort is persisted across
  // reloads; other state falls back to the default (oldest-first by invoice
  // date).

  return (
    <InvoicesListProvider
      query={transformTableStateToQuery(invoicesTableState)}
      tableStateChanged={invoicesTableStateChanged}
    >
      <InvoicesActionsBar />

      <DashboardPageContent>
        <InvoicesDataTable />
      </DashboardPageContent>
    </InvoicesListProvider>
  );
}

export default compose(
  withInvoices(({ invoicesTableState, invoicesTableStateChanged }) => ({
    invoicesTableState,
    invoicesTableStateChanged,
  })),
  withAlertActions,
)(InvoicesList);
