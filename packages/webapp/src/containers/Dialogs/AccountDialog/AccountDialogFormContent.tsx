// @ts-nocheck
import React from 'react';
import { Form, useFormikContext } from 'formik';
import { Button, Classes, FormGroup, Intent } from '@blueprintjs/core';
import {
  If,
  FieldRequiredHint,
  Hint,
  AccountsSelect,
  AccountsTypesSelect,
  CurrencySelect,
  FormattedMessage as T,
  FFormGroup,
  FInputGroup,
  FCheckbox,
  FSelect,
  FTextArea,
} from '@/components';
import { withAccounts } from '@/containers/Accounts/withAccounts';

import {
  FOREIGN_CURRENCY_ACCOUNTS,
  ACCOUNT_TYPE,
} from '@/constants/accountTypes';

// Account sub-types used to group the cashflow-accounts cards into sections.
// Checking/Savings apply to bank accounts; Clearing applies to bank or
// other-current-asset accounts (e.g. Square / Stripe settlement accounts) and
// surfaces them on the cashflow page. `other`/unset bank accounts fall under
// the "Bank Accounts" section.
const ACCOUNT_SUBTYPES = [
  { key: 'checking', label: 'Checking', forTypes: [ACCOUNT_TYPE.BANK] },
  { key: 'savings', label: 'Savings', forTypes: [ACCOUNT_TYPE.BANK] },
  {
    key: 'clearing',
    label: 'Clearing',
    forTypes: [ACCOUNT_TYPE.BANK, ACCOUNT_TYPE.OTHER_CURRENT_ASSET],
  },
  {
    key: 'other',
    label: 'Other',
    forTypes: [ACCOUNT_TYPE.BANK, ACCOUNT_TYPE.OTHER_CURRENT_ASSET],
  },
];

import { useAutofocus } from '@/hooks';
import { useAccountDialogContext } from './AccountDialogProvider';

import { parentAccountShouldUpdate } from './utils';
import { compose } from '@/utils';

/**
 * Account form dialogs fields.
 */
function AccountFormDialogFields({
  // #ownProps
  onClose,
  action,
}) {
  const { values, isSubmitting, setFieldValue } = useFormikContext();
  const accountNameFieldRef = useAutofocus();

  // Account form context.
  const { fieldsDisabled, accounts, accountsTypes, currencies } =
    useAccountDialogContext();

  // Sub-type options available for the currently-selected account type.
  const subtypeItems = ACCOUNT_SUBTYPES.filter((option) =>
    option.forTypes.includes(values.account_type),
  );

  return (
    <Form>
      <div className={Classes.DIALOG_BODY}>
        <FFormGroup
          inline={true}
          label={<T id={'account_type'} />}
          labelInfo={<FieldRequiredHint />}
          name={'account_type'}
          fastField={true}
        >
          <AccountsTypesSelect
            name={'account_type'}
            items={accountsTypes}
            onItemSelect={(accountType) => {
              setFieldValue('account_type', accountType.key);
              setFieldValue('currency_code', '');
              // Sub-type only applies to bank accounts; clear it on type change.
              setFieldValue('bank_account_subtype', '');
            }}
            disabled={fieldsDisabled.accountType}
            popoverProps={{ minimal: true }}
            fastField={true}
            fill={true}
          />
        </FFormGroup>

        <FFormGroup
          name={'name'}
          label={<T id={'account_name'} />}
          labelInfo={<FieldRequiredHint />}
          inline={true}
          fastField={true}
        >
          <FInputGroup
            medium={true}
            inputRef={(ref) => (accountNameFieldRef.current = ref)}
            name={'name'}
            fastField={true}
          />
        </FFormGroup>

        <FFormGroup
          label={<T id={'account_code'} />}
          name={'code'}
          labelInfo={<Hint content={<T id="account_code_hint" />} />}
          inline={true}
          fastField={true}
        >
          <FInputGroup medium={true} name={'code'} fastField={true} />
        </FFormGroup>

        <FFormGroup
          label={' '}
          name={'subaccount'}
          inline={true}
          fastField={true}
        >
          <FCheckbox
            inline={true}
            label={<T id={'sub_account'} />}
            name={'subaccount'}
            fastField={true}
          />
        </FFormGroup>

        {values.subaccount && (
          <FFormGroup
            name={'parent_account_id'}
            shouldUpdate={parentAccountShouldUpdate}
            label={<T id={'parent_account'} />}
            inline={true}
            fastField={true}
          >
            <AccountsSelect
              name={'parent_account_id'}
              items={accounts}
              shouldUpdate={parentAccountShouldUpdate}
              placeholder={<T id={'select_parent_account'} />}
              filterByTypes={values.account_type}
              buttonProps={{ disabled: !values.subaccount }}
              fastField={true}
              fill={true}
              allowCreate={true}
            />
          </FFormGroup>
        )}

        <If condition={subtypeItems.length > 0}>
          {/*------------ Account subtype -----------*/}
          <FFormGroup
            label={<T id={'bank_account_subtype'} />}
            name={'bank_account_subtype'}
            inline={true}
          >
            <FSelect
              name={'bank_account_subtype'}
              items={subtypeItems}
              valueAccessor={'key'}
              textAccessor={'label'}
              labelAccessor={'key'}
              placeholder={<T id={'bank_account_subtype.placeholder'} />}
              popoverProps={{ minimal: true }}
              fill={true}
            />
          </FFormGroup>
        </If>

        <If condition={FOREIGN_CURRENCY_ACCOUNTS.includes(values.account_type)}>
          {/*------------ Currency  -----------*/}
          <FFormGroup
            label={<T id={'currency'} />}
            name={'currency_code'}
            inline={true}
            fastField={true}
          >
            <CurrencySelect
              name={'currency_code'}
              currencies={currencies}
              popoverProps={{ minimal: true }}
              fastField={true}
              fill={true}
            />
          </FFormGroup>
        </If>

        <FFormGroup
          label={<T id={'description'} />}
          name={'description'}
          inline={true}
          fastField={true}
        >
          <FTextArea
            name={'description'}
            growVertically={true}
            height={280}
            fill={true}
            fastField={true}
          />
        </FFormGroup>
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button
            disabled={isSubmitting}
            onClick={onClose}
            style={{ minWidth: '75px' }}
          >
            <T id={'close'} />
          </Button>

          <Button
            intent={Intent.PRIMARY}
            loading={isSubmitting}
            style={{ minWidth: '95px' }}
            type="submit"
          >
            {action === 'edit' ? <T id={'edit'} /> : <T id={'submit'} />}
          </Button>
        </div>
      </div>
    </Form>
  );
}

export default compose(
  withAccounts(({ accountsTypes, accountsList }) => ({
    accountsTypes,
    accounts: accountsList,
  })),
)(AccountFormDialogFields);
