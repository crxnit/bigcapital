// @ts-nocheck
import React from 'react';

import BillDetailHeader from './BillDetailHeader';
import BillDetailTable from './BillDetailTable';
import BillDetailCategoriesTable from './BillDetailCategoriesTable';
import BillDetailFooter from './BillDetailFooter';
import { CommercialDocBox } from '@/components';
import { BillDetailTableFooter } from './BillDetailTableFooter';

/**
 * Bill detail panel tab.
 */
export default function BillDetailTab() {
  return (
    <CommercialDocBox>
      <BillDetailHeader />
      <BillDetailTable />
      <BillDetailCategoriesTable />
      <BillDetailTableFooter />
      <BillDetailFooter />
    </CommercialDocBox>
  );
}
