// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Intent, Alert } from '@blueprintjs/core';
import { useHistory } from 'react-router-dom';
import {
  AppToaster,
  FormattedMessage as T,
  FormattedHTMLMessage,
} from '@/components';

import { handleDeleteErrors } from '@/containers/Accounts/utils';

import { withAlertStoreConnect } from '@/containers/Alert/withAlertStoreConnect';
import { withAlertActions } from '@/containers/Alert/withAlertActions';
import { withDrawerActions } from '@/containers/Drawer/withDrawerActions';

import { useDeleteAccount } from '@/hooks/query';
import { compose } from '@/utils';
import { DRAWERS } from '@/constants/drawers';

/**
 * Account delete alerts.
 */
function AccountDeleteAlert({
  name,

  // #withAlertStoreConnect
  isOpen,
  payload: { accountId, redirectTo },

  // #withAlertActions
  closeAlert,

  // #withDrawerActions
  closeDrawer,
}) {
  const { isLoading, mutateAsync: deleteAccount } = useDeleteAccount();
  const history = useHistory();

  // handle cancel delete account alert.
  const handleCancelAccountDelete = () => {
    closeAlert(name);
  };
  // Handle confirm account delete.
  const handleConfirmAccountDelete = () => {
    deleteAccount(accountId)
      .then(() => {
        AppToaster.show({
          message: intl.get('the_account_has_been_successfully_deleted'),
          intent: Intent.SUCCESS,
        });
        closeAlert(name);
        closeDrawer(DRAWERS.ACCOUNT_DETAILS);
        // When opened from a per-account page (e.g. /cashflow-accounts/:id/transactions),
        // the caller passes `redirectTo` so we navigate away — otherwise the
        // page's `useAccount(id)` keeps refetching the deleted id and 404s.
        if (redirectTo) {
          history.push(redirectTo);
        }
      })
      .catch((error) => {
        const errors = error?.response?.data?.errors ?? [];
        handleDeleteErrors(errors);
        closeAlert(name);
      });
  };

  return (
    <Alert
      cancelButtonText={<T id={'cancel'} />}
      confirmButtonText={<T id={'delete'} />}
      icon="trash"
      intent={Intent.DANGER}
      isOpen={isOpen}
      onCancel={handleCancelAccountDelete}
      onConfirm={handleConfirmAccountDelete}
      loading={isLoading}
    >
      <p>
        <FormattedHTMLMessage
          id={'once_delete_this_account_you_will_able_to_restore_it'}
        />
      </p>
    </Alert>
  );
}

export default compose(
  withAlertStoreConnect(),
  withAlertActions,
  withDrawerActions,
)(AccountDeleteAlert);
