// @ts-nocheck
import { FastField } from 'formik';
import VendorCreditNoteCategoriesTable from './VendorCreditNoteCategoriesTable';
import { defaultFastFieldShouldUpdate } from '@/utils';

const categoriesFieldShouldUpdate = (newProps, oldProps) => {
  return (
    newProps.accounts !== oldProps.accounts ||
    defaultFastFieldShouldUpdate(newProps, oldProps)
  );
};

/**
 * Formik FastField wrapper around VendorCreditNoteCategoriesTable.
 * Mirrors the bills form's BillFormCategoriesEditor.
 */
export default function VendorCreditNoteCategoriesEditor({ accounts }) {
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
        <VendorCreditNoteCategoriesTable
          categories={value}
          onChange={(rows) => setFieldValue('categories', rows)}
          error={error}
          currencyCode={values.currency_code}
        />
      )}
    </FastField>
  );
}
