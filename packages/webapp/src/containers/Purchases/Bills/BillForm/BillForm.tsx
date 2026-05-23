// @ts-nocheck
import React, { useMemo } from 'react';
import intl from 'react-intl-universal';
import classNames from 'classnames';
import { Formik, Form } from 'formik';
import { Intent } from '@blueprintjs/core';
import { useHistory } from 'react-router-dom';
import { isEmpty } from 'lodash';
import { CLASSES } from '@/constants/classes';
import { css } from '@emotion/css';

import { EditBillFormSchema, CreateBillFormSchema } from './BillForm.schema';
import BillFormHeader from './BillFormHeader';
import BillFloatingActions from './BillFloatingActions';
import BillFormFooter from './BillFormFooter';
import BillItemsEntriesEditor from './BillItemsEntriesEditor';
import BillFormTopBar from './BillFormTopBar';

import { AppToaster, Box } from '@/components';
import { PageForm } from '@/components/PageForm';
import { useBillFormContext } from './BillFormProvider';
import { compose, safeSumBy } from '@/utils';
import {
  defaultBill,
  filterNonZeroEntries,
  filterNonZeroCategories,
  transformToEditForm,
  transformFormValuesToRequest,
  handleErrors,
} from './utils';
import AllocationsCategoriesEditor from '@/containers/_shared/Allocations/AllocationsCategoriesEditor';
import { withCurrentOrganization } from '@/containers/Organization/withCurrentOrganization';
import { BillFormEntriesActions } from './BillFormEntriesActions';

/**
 * Bill form.
 */
function BillForm({
  // #withCurrentOrganization
  organization: { base_currency },
}) {
  const history = useHistory();

  // Bill form context.
  const {
    bill,
    isNewMode,
    submitPayload,
    createBillMutate,
    editBillMutate,
    accounts,
  } = useBillFormContext();

  // Initial values in create and edit mode.
  const initialValues = useMemo(
    () => ({
      ...(!isEmpty(bill)
        ? {
            ...transformToEditForm(bill),
          }
        : {
            ...defaultBill,
            currency_code: base_currency,
          }),
    }),
    [bill, base_currency],
  );

  // Handles form submit.
  const handleFormSubmit = (
    values,
    { setSubmitting, setErrors, resetForm },
  ) => {
    const entries = filterNonZeroEntries(values.entries);
    const totalQuantity = safeSumBy(entries, 'quantity');
    const categories = filterNonZeroCategories(values.categories || []);
    // `safeSumBy` uses `_.get(row, path)` and only accepts a STRING path
    // (a function returns undefined → toSafeNumber → 0). Pass the column
    // name directly — `Number()` coercion is already inside safeSumBy.
    const categoriesTotal = safeSumBy(categories, 'amount');

    // Only block when the bill is genuinely empty. With the new direct-
    // account allocations panel, a bill may have zero items entries (and
    // therefore zero quantity) yet still be valid because the categories
    // table carries the full amount.
    if (totalQuantity === 0 && categoriesTotal === 0) {
      AppToaster.show({
        message: intl.get('quantity_cannot_be_zero_or_empty'),
        intent: Intent.DANGER,
      });
      setSubmitting(false);
      return;
    }
    const form = {
      ...transformFormValuesToRequest(values),
      open: submitPayload.status,
    };
    // Handle the request success.
    const onSuccess = (response) => {
      AppToaster.show({
        message: intl.get(
          isNewMode
            ? 'the_bill_has_been_created_successfully'
            : 'the_bill_has_been_edited_successfully',
        ),
        intent: Intent.SUCCESS,
      });
      setSubmitting(false);

      if (submitPayload.redirect) {
        history.push('/bills');
      }
      if (submitPayload.resetForm) {
        resetForm();
      }
    };
    // Handle the request error.
    const onError = ({
      response: {
        data: { errors },
      },
    }) => {
      handleErrors(errors, { setErrors });
      setSubmitting(false);
    };
    if (isNewMode) {
      createBillMutate(form).then(onSuccess).catch(onError);
    } else {
      editBillMutate([bill.id, form]).then(onSuccess).catch(onError);
    }
  };

  return (
    <Formik
      validationSchema={isNewMode ? CreateBillFormSchema : EditBillFormSchema}
      initialValues={initialValues}
      onSubmit={handleFormSubmit}
    >
      <Form
        className={css({
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        })}
      >
        <PageForm flex={1}>
          <PageForm.Body>
            <BillFormTopBar />
            <BillFormHeader />

            <Box p="18px 32px 0">
              <BillFormEntriesActions />
              <BillItemsEntriesEditor />
              <AllocationsCategoriesEditor
                accounts={accounts}
                accountField={'expense_account_id'}
                accountRootType={'expense'}
                tableName={'bill-categories'}
                labelKey={'direct_expense_allocations'}
              />
            </Box>
            <BillFormFooter />
          </PageForm.Body>

          <PageForm.Footer>
            <BillFloatingActions />
          </PageForm.Footer>
        </PageForm>
      </Form>
    </Formik>
  );
}
export default compose(withCurrentOrganization())(BillForm);
