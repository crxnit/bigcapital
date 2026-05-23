// @ts-nocheck
import { FastField } from 'formik';
import intl from 'react-intl-universal';
import { Box } from '@/components';
import { defaultFastFieldShouldUpdate } from '@/utils';
import AllocationsCategoriesTable from './AllocationsCategoriesTable';

/**
 * Shared Formik FastField wrapper around AllocationsCategoriesTable plus
 * the section header. Replaces BillFormCategoriesEditor /
 * VendorCreditNoteCategoriesEditor / InvoiceFormCategoriesEditor.
 *
 * Re-renders only when the form's `categories` field or the passed-in
 * `accounts` reference changes (matches the per-form editor behaviour the
 * three originals each implemented inline).
 */
const allocationsFieldShouldUpdate = (newProps, oldProps) => {
  return (
    newProps.accounts !== oldProps.accounts ||
    defaultFastFieldShouldUpdate(newProps, oldProps)
  );
};

export default function AllocationsCategoriesEditor({
  accounts,
  accountField,
  accountRootType,
  tableName,
  labelKey,
  fieldName = 'categories',
}) {
  return (
    <Box mt={4}>
      <Box mb={2} fontSize={13} fontWeight={500}>
        {intl.get(labelKey)}
      </Box>
      <FastField
        name={fieldName}
        accounts={accounts}
        shouldUpdate={allocationsFieldShouldUpdate}
      >
        {({
          form: { values, setFieldValue },
          field: { value },
          meta: { error },
        }) => (
          <AllocationsCategoriesTable
            categories={value}
            onChange={(rows) => setFieldValue(fieldName, rows)}
            error={error}
            currencyCode={values.currency_code}
            accounts={accounts}
            accountField={accountField}
            accountRootType={accountRootType}
            tableName={tableName}
          />
        )}
      </FastField>
    </Box>
  );
}
