// @ts-nocheck
import { FastField } from 'formik';
import BillFormCategoriesTable from './BillFormCategoriesTable';
import { defaultFastFieldShouldUpdate } from '@/utils';

const categoriesFieldShouldUpdate = (newProps, oldProps) => {
  return (
    newProps.accounts !== oldProps.accounts ||
    defaultFastFieldShouldUpdate(newProps, oldProps)
  );
};

/**
 * Formik FastField wrapper around BillFormCategoriesTable. Mirrors
 * `BillItemsEntriesEditor.tsx` but for the new direct-account allocations.
 */
export default function BillFormCategoriesEditor({ accounts }) {
  return (
    <FastField
      name={'categories'}
      accounts={accounts}
      shouldUpdate={categoriesFieldShouldUpdate}
    >
      {({
        form: { values, setFieldValue },
        field: { value },
        meta: { error },
      }) => (
        <BillFormCategoriesTable
          categories={value}
          onChange={(rows) => setFieldValue('categories', rows)}
          errors={error}
          currencyCode={values.currency_code}
        />
      )}
    </FastField>
  );
}
