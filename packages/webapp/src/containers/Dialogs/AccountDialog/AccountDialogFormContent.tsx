// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
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
  BANK_ACCOUNT_SUBTYPE,
} from '@/constants/accountTypes';
import { BANK_LOGO_LIBRARY } from '@/constants/bankLogos';
import { BankLogoMark } from '@/components/BankAccounts';
import { CompanyLogoUpload } from '@/containers/ElementCustomize/components/CompanyLogoUpload';
import { useAutofocus } from '@/hooks';
import { useAccountDialogContext } from './AccountDialogProvider';
import { parentAccountShouldUpdate } from './utils';
import { compose } from '@/utils';

// Account sub-types used to group the cashflow-accounts cards into sections.
// Checking/Savings/Other apply to bank accounts only; Clearing applies to bank
// OR other-current-asset accounts (e.g. Square / Stripe settlement accounts),
// which is the only subtype that surfaces an other-current-asset account on the
// cashflow page. `other`/unset bank accounts fall under the "Bank Accounts"
// section.
// Account types that surface as cards on the cashflow-accounts page and can
// therefore carry a logo (clearing OCA accounts are handled via subtype below).
const LOGO_ACCOUNT_TYPES = [
  ACCOUNT_TYPE.BANK,
  ACCOUNT_TYPE.CASH,
  ACCOUNT_TYPE.CREDIT_CARD,
];

const ACCOUNT_SUBTYPES = [
  {
    key: BANK_ACCOUNT_SUBTYPE.CHECKING,
    label: 'Checking',
    forTypes: [ACCOUNT_TYPE.BANK],
  },
  {
    key: BANK_ACCOUNT_SUBTYPE.SAVINGS,
    label: 'Savings',
    forTypes: [ACCOUNT_TYPE.BANK],
  },
  {
    key: BANK_ACCOUNT_SUBTYPE.CLEARING,
    label: 'Clearing',
    forTypes: [ACCOUNT_TYPE.BANK, ACCOUNT_TYPE.OTHER_CURRENT_ASSET],
  },
  {
    key: BANK_ACCOUNT_SUBTYPE.OTHER,
    label: 'Other',
    forTypes: [ACCOUNT_TYPE.BANK],
  },
];

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

  // Logo applies to accounts shown on the cashflow page: cash/bank/credit-card,
  // plus any account tagged as a clearing account.
  const showLogoField =
    LOGO_ACCOUNT_TYPES.includes(values.account_type) ||
    values.bank_account_subtype === BANK_ACCOUNT_SUBTYPE.CLEARING;

  // Preview of an already-selected library logo (custom uploads preview through
  // the upload component itself).
  const selectedLibraryLogo = BANK_LOGO_LIBRARY.find(
    (logo) => logo.slug === values.bank_account_logo_slug,
  );

  // Existing custom logo preview: the attachment is served (proxied) at this
  // public path, so we can show it without resolving a presigned URL here.
  const customLogoPreview = values.bank_account_logo_key
    ? `/api/attachments/${values.bank_account_logo_key}`
    : undefined;

  // Selecting a library logo and uploading a custom image are mutually
  // exclusive — choosing one clears the other.
  const handleSelectLibraryLogo = (logo) => {
    setFieldValue('bank_account_logo_slug', logo.slug);
    setFieldValue('bank_account_logo_key', '');
    setFieldValue('_logo_file', null);
  };
  const handleCustomLogoChange = (file) => {
    setFieldValue('_logo_file', file || null);
    setFieldValue('bank_account_logo_slug', '');
    // Removing the staged/existing image clears the persisted key too.
    if (!file) {
      setFieldValue('bank_account_logo_key', '');
    }
  };

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
              hideParentAccounts={false}
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

        <If condition={showLogoField}>
          {/*------------ Bank logo -----------*/}
          <FFormGroup
            label={<T id={'bank_account_logo'} />}
            name={'bank_account_logo_slug'}
            inline={true}
            helperText={<T id={'bank_account_logo.hint'} />}
          >
            <FSelect
              name={'bank_account_logo_slug'}
              items={BANK_LOGO_LIBRARY}
              valueAccessor={'slug'}
              textAccessor={'label'}
              labelAccessor={'slug'}
              placeholder={<T id={'bank_account_logo.library_placeholder'} />}
              onItemSelect={handleSelectLibraryLogo}
              popoverProps={{ minimal: true }}
              fill={true}
            />

            {selectedLibraryLogo && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <BankLogoMark
                  logo={{
                    kind: 'library',
                    src: selectedLibraryLogo.src,
                    color: selectedLibraryLogo.color,
                  }}
                  size={36}
                />
                <Button
                  minimal
                  small
                  intent={Intent.DANGER}
                  onClick={() => setFieldValue('bank_account_logo_slug', '')}
                >
                  <T id={'remove'} />
                </Button>
              </div>
            )}

            <div style={{ margin: '10px 0 6px', fontSize: 12, opacity: 0.7 }}>
              <T id={'bank_account_logo.or_upload'} />
            </div>
            <CompanyLogoUpload
              initialPreview={customLogoPreview}
              value={values._logo_file}
              onChange={handleCustomLogoChange}
              title={intl.get('bank_account_logo.upload_title')}
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
