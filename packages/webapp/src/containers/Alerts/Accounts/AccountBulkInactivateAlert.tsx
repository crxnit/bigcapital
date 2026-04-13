// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import { Intent, Alert } from '@blueprintjs/core';
import { FormattedMessage as T, AppToaster } from '@/components';

import { withAlertStoreConnect } from '@/containers/Alert/withAlertStoreConnect';
import { withAlertActions } from '@/containers/Alert/withAlertActions';

import { compose } from '@/utils';
import { useInactivateAccount } from '@/hooks/query';

function AccountBulkInactivateAlert({
  name,
  isOpen,
  payload: { accountsIds },

  // #withAlertActions
  closeAlert,
}) {
  const { mutateAsync: inactivateAccount, isLoading } = useInactivateAccount();

  // Handle alert cancel.
  const handleCancel = () => {
    closeAlert(name);
  };
  // Handle Bulk Inactive accounts confirm.
  const handleConfirmBulkInactive = () => {
    Promise.all(accountsIds.map((id) => inactivateAccount(id)))
      .then(() => {
        AppToaster.show({
          message: intl.get('the_accounts_have_been_successfully_inactivated'),
          intent: Intent.SUCCESS,
        });
      })
      .catch(() => {})
      .finally(() => {
        closeAlert(name);
      });
  };

  return (
    <Alert
      cancelButtonText={<T id={'cancel'} />}
      confirmButtonText={`${intl.get('inactivate')} (${accountsIds.length})`}
      intent={Intent.WARNING}
      isOpen={isOpen}
      onCancel={handleCancel}
      onConfirm={handleConfirmBulkInactive}
      loading={isLoading}
    >
      <p>
        <T id={'are_sure_to_inactive_this_accounts'} />
      </p>
    </Alert>
  );
}

export default compose(
  withAlertStoreConnect(),
  withAlertActions,
)(AccountBulkInactivateAlert);
