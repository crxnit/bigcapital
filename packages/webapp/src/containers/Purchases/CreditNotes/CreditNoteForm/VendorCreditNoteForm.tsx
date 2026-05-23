// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';
import { Formik, Form } from 'formik';
import { Intent } from '@blueprintjs/core';
import { isEmpty } from 'lodash';
import { CLASSES } from '@/constants/classes';
import { css } from '@emotion/css';
import { PageForm } from '@/components/PageForm';
import {
  CreateCreditNoteFormSchema,
  EditCreditNoteFormSchema,
} from './VendorCreditNoteForm.schema';

import VendorCreditNoteFormHeader from './VendorCreditNoteFormHeader';
import VendorCreditNoteItemsEntriesEditor from './VendorCreditNoteItemsEntriesEditor';
import AllocationsCategoriesEditor from '@/containers/_shared/Allocations/AllocationsCategoriesEditor';
import VendorCreditNoteFormFooter from './VendorCreditNoteFormFooter';
import VendorCreditNoteFloatingActions from './VendorCreditNoteFloatingActions';
import VendorCreditNoteFormDialogs from './VendorCreditNoteFormDialogs';
import VendorCreditNoteFormTopBar from './VendorCreditNoteFormTopBar';

import { useVendorCreditNoteFormContext } from './VendorCreditNoteFormProvider';

import { AppToaster, Box } from '@/components';
import { compose, safeSumBy, transactionNumber } from '@/utils';
import {
  defaultVendorsCreditNote,
  filterNonZeroEntries,
  filterNonZeroCategories,
  transformToEditForm,
  transformFormValuesToRequest,
} from './utils';

import { withSettings } from '@/containers/Settings/withSettings';
import { withCurrentOrganization } from '@/containers/Organization/withCurrentOrganization';

/**
 * Vendor Credit note form.
 */
function VendorCreditNoteForm({
  // #withSettings
  vendorcreditAutoIncrement,
  vendorcreditNumberPrefix,
  vendorcreditNextNumber,

  // #withCurrentOrganization
  organization: { base_currency },
}) {
  const history = useHistory();

  // Vendor Credit note form context.
  const {
    isNewMode,
    submitPayload,
    vendorCredit,
    newVendorCredit,
    createVendorCreditMutate,
    editVendorCreditMutate,
    accounts,
  } = useVendorCreditNoteFormContext();

  // Credit number.
  const vendorCreditNumber = transactionNumber(
    vendorcreditNumberPrefix,
    vendorcreditNextNumber,
  );

  // Initial values.
  const initialValues = React.useMemo(
    () => ({
      ...(!isEmpty(vendorCredit)
        ? {
            ...transformToEditForm(vendorCredit),
          }
        : {
            ...defaultVendorsCreditNote,
            ...(vendorcreditAutoIncrement && {
              vendor_credit_number: vendorCreditNumber,
            }),
            currency_code: base_currency,
            ...newVendorCredit,
          }),
    }),
    [vendorCredit, base_currency],
  );

  // Handles form submit.
  const handleFormSubmit = (
    values,
    { setSubmitting, setErrors, resetForm },
  ) => {
    const entries = filterNonZeroEntries(values.entries);
    const categories = filterNonZeroCategories(values.categories || []);
    const totalQuantity = safeSumBy(entries, 'quantity');

    // Allow categories-only submits — block only when neither items nor
    // categories carry any value.
    if (totalQuantity === 0 && categories.length === 0) {
      AppToaster.show({
        message: intl.get('quantity_cannot_be_zero_or_empty'),
        intent: Intent.DANGER,
      });
      setSubmitting(false);
      return;
    }
    const form = {
      ...transformFormValuesToRequest(values),
      open: submitPayload.open,
    };
    // Handle the request success.
    const onSuccess = (response) => {
      AppToaster.show({
        message: intl.get(
          isNewMode
            ? 'vendor_credits.success_message'
            : 'vendor_credits.edit_success_message',
        ),
        intent: Intent.SUCCESS,
      });
      setSubmitting(false);

      if (submitPayload.redirect) {
        history.push('/vendor-credits');
      }
      if (submitPayload.resetForm) {
        resetForm();
      }
    };
    // Handle the request error. Surface whatever the server reported so the
    // user isn't left wondering why nothing happened — class-validator
    // returns `message: string | string[]`, the legacy handler returns
    // `errors: [{ message }]`.
    const onError = (error) => {
      const data = error?.response?.data;
      const messages: string[] = [];
      if (Array.isArray(data?.message)) messages.push(...data.message);
      else if (typeof data?.message === 'string') messages.push(data.message);
      if (Array.isArray(data?.errors)) {
        data.errors.forEach((e) => {
          if (e?.message) messages.push(e.message);
        });
      }
      AppToaster.show({
        message:
          messages.join(' • ') ||
          intl.get('something_wentwrong') ||
          'Save failed.',
        intent: Intent.DANGER,
      });
      setSubmitting(false);
    };
    if (isNewMode) {
      createVendorCreditMutate(form).then(onSuccess).catch(onError);
    } else {
      editVendorCreditMutate([vendorCredit.id, form])
        .then(onSuccess)
        .catch(onError);
    }
  };

  return (
    <Formik
      validationSchema={
        isNewMode ? CreateCreditNoteFormSchema : EditCreditNoteFormSchema
      }
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
            <VendorCreditNoteFormTopBar />
            <VendorCreditNoteFormHeader />

            <Box p="18px 32px 0">
              <VendorCreditNoteItemsEntriesEditor />
              <AllocationsCategoriesEditor
                accounts={accounts}
                accountField={'expense_account_id'}
                accountRootType={'expense'}
                tableName={'vendor-credit-categories'}
                labelKey={'direct_expense_allocations'}
              />
            </Box>

            <VendorCreditNoteFormFooter />
          </PageForm.Body>

          <PageForm.Footer>
            <VendorCreditNoteFloatingActions />
          </PageForm.Footer>

          {/* ---------- Dialogs ---------- */}
          <VendorCreditNoteFormDialogs />
        </PageForm>
      </Form>
    </Formik>
  );
}

export default compose(
  withSettings(({ vendorsCreditNoteSetting }) => ({
    vendorcreditAutoIncrement: vendorsCreditNoteSetting?.autoIncrement,
    vendorcreditNextNumber: vendorsCreditNoteSetting?.nextNumber,
    vendorcreditNumberPrefix: vendorsCreditNoteSetting?.numberPrefix,
  })),
  withCurrentOrganization(),
)(VendorCreditNoteForm);
