// @ts-nocheck
import { FastField } from 'formik';
import InvoiceFormCategoriesTable from './InvoiceFormCategoriesTable';
import { defaultFastFieldShouldUpdate } from '@/utils';

/**
 * Formik FastField wrapper around InvoiceFormCategoriesTable. Mirrors
 * `BillFormCategoriesEditor.tsx` but for the revenue side. Accounts come
 * from `useInvoiceFormContext()` inside the table, so the editor itself
 * has no props.
 */
export default function InvoiceFormCategoriesEditor() {
  return (
    <FastField name={'categories'} shouldUpdate={defaultFastFieldShouldUpdate}>
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
