// @ts-nocheck
import React, { useCallback } from 'react';
import intl from 'react-intl-universal';
import { Intent } from '@blueprintjs/core';
import { Formik } from 'formik';
import { AppToaster } from '@/components';

import AccountDialogFormContent from './AccountDialogFormContent';

import { withDialogActions } from '@/containers/Dialog/withDialogActions';
import {
  EditAccountFormSchema,
  CreateAccountFormSchema,
} from './AccountForm.schema';
import { compose, transformToForm } from '@/utils';
import { useUploadAttachments } from '@/hooks/query/attachments';
import {
  transformApiErrors,
  transformAccountToForm,
  transformFormToReq,
} from './utils';

import '@/style/pages/Accounts/AccountFormDialog.scss';
import { useAccountDialogContext } from './AccountDialogProvider';

// Default initial form values.
const defaultInitialValues = {
  account_type: '',
  parent_account_id: '',
  name: '',
  code: '',
  description: '',
  currency_code: '',
  subaccount: false,
  bank_account_subtype: '',
  // Bank logo: a bundled library slug OR a custom uploaded attachment key.
  // `_logo_file` is a transient staged upload, stripped before the request.
  bank_account_logo_slug: '',
  bank_account_logo_key: '',
  _logo_file: null,
};

/**
 * Account form dialog content.
 */
function AccountFormDialogContent({
  // #withDialogActions
  closeDialog,
}) {
  // Account form context.
  const {
    editAccountMutate,
    createAccountMutate,
    account,

    payload,
    isNewMode,
    dialogName,
  } = useAccountDialogContext();

  // Uploads the custom bank-logo attachment (when one is staged).
  const { mutateAsync: uploadAttachments } = useUploadAttachments({});

  // Form validation schema in create and edit mode.
  const validationSchema = isNewMode
    ? CreateAccountFormSchema
    : EditAccountFormSchema;

  // Callbacks handles form submit.
  const handleFormSubmit = async (values, { setSubmitting, setErrors }) => {
    const toastAccountName = values.code
      ? `${values.code} - ${values.name}`
      : values.name;

    // Handle request success.
    const handleSuccess = () => {
      closeDialog(dialogName);

      AppToaster.show({
        message: intl.get(
          isNewMode
            ? 'service_has_been_created_successfully'
            : 'service_has_been_edited_successfully',
          {
            name: toastAccountName,
            service: intl.get('account'),
          },
        ),
        intent: Intent.SUCCESS,
      });
    };
    // Handle request error.
    const handleError = (error) => {
      const {
        response: {
          data: { errors },
        },
      } = error;

      const errorsTransformed = transformApiErrors(errors);
      setErrors({ ...errorsTransformed });
      setSubmitting(false);
    };

    // Upload the custom bank logo first if a new file has been staged; the
    // returned attachment key replaces any previous logo and clears the
    // library slug (the two logo sources are mutually exclusive).
    const _values = { ...values };
    if (_values._logo_file) {
      const formData = new FormData();
      formData.append('file', _values._logo_file);
      formData.append('internalKey', Date.now().toString());
      try {
        const uploaded = await uploadAttachments(formData);
        _values.bank_account_logo_key = uploaded?.key;
        _values.bank_account_logo_slug = '';
      } catch {
        AppToaster.show({
          intent: Intent.DANGER,
          message: intl.get('bank_account_logo.upload_error'),
        });
        setSubmitting(false);
        return;
      }
    }

    const form = transformFormToReq(_values);
    if (payload.accountId) {
      editAccountMutate([payload.accountId, form])
        .then(handleSuccess)
        .catch(handleError);
    } else {
      createAccountMutate({ ...form })
        .then(handleSuccess)
        .catch(handleError);
    }
  };
  // Form initial values in create and edit mode.
  const initialValues = {
    ...defaultInitialValues,
    /**
     * We only care about the fields in the form. Previously unfilled optional
     * values such as `notes` come back from the API as null, so remove those
     * as well.
     */
    ...transformToForm(
      transformAccountToForm(account, payload),
      defaultInitialValues,
    ),
  };
  // Handles dialog close.
  const handleClose = useCallback(() => {
    closeDialog(dialogName);
  }, [closeDialog, dialogName]);

  return (
    <Formik
      validationSchema={validationSchema}
      initialValues={initialValues}
      onSubmit={handleFormSubmit}
    >
      <AccountDialogFormContent
        dialogName={dialogName}
        action={payload?.action}
        onClose={handleClose}
      />
    </Formik>
  );
}

export default compose(withDialogActions)(AccountFormDialogContent);
