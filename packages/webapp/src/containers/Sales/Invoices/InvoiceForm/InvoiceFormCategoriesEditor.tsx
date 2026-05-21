// @ts-nocheck
import { FastField } from 'formik';
import InvoiceFormCategoriesTable from './InvoiceFormCategoriesTable';
import { defaultFastFieldShouldUpdate } from '@/utils';

const categoriesFieldShouldUpdate = (newProps, oldProps) => {
  return (
    newProps.accounts !== oldProps.accounts ||
    defaultFastFieldShouldUpdate(newProps, oldProps)
  );
};

/**
 * Formik FastField wrapper around InvoiceFormCategoriesTable. Mirrors
 * `BillFormCategoriesEditor.tsx` but for the revenue side.
 */
export default function InvoiceFormCategoriesEditor({ accounts }) {
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
        <InvoiceFormCategoriesTable
          categories={value}
          onChange={(rows) => setFieldValue('categories', rows)}
          errors={error}
          currencyCode={values.currency_code}
        />
      )}
    </FastField>
  );
}
