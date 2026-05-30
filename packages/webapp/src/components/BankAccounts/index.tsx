// @ts-nocheck
import React from 'react';
import intl from 'react-intl-universal';
import styled from 'styled-components';
import clsx from 'classnames';
import { Classes } from '@blueprintjs/core';
import { Icon } from '@/components/Icon';
import { ACCOUNT_TYPE, BANK_ACCOUNT_SUBTYPE } from '@/constants';

const ACCOUNT_TYPE_PAIR_ICON = {
  [ACCOUNT_TYPE.CASH]: 'payments',
  [ACCOUNT_TYPE.CREDIT_CARD]: 'credit-card',
  [ACCOUNT_TYPE.BANK]: 'account-balance',
};

// Per-type accent colors for the top-right badge. Low-alpha tints read fine on
// both the light and dark card backgrounds.
const ACCOUNT_TYPE_BADGE_COLORS = {
  [ACCOUNT_TYPE.CASH]: { fg: '#0f9960', bg: 'rgba(15, 153, 96, 0.13)' },
  [ACCOUNT_TYPE.CREDIT_CARD]: { fg: '#7b61ff', bg: 'rgba(123, 97, 255, 0.15)' },
  [ACCOUNT_TYPE.BANK]: { fg: '#2d72d2', bg: 'rgba(45, 114, 210, 0.13)' },
};

// Clearing accounts get their own badge regardless of underlying account type
// (they may be Bank or Other Current Asset).
const CLEARING_BADGE = {
  icon: 'swap-horiz',
  colors: { fg: '#0c8599', bg: 'rgba(12, 133, 153, 0.13)' },
};

function BankAccountMetaLine({ title, value, className }) {
  return (
    <MetaLineWrap className={className}>
      <MetaLineTitle>{title}</MetaLineTitle>
      {value && <MetaLineValue>{value}</MetaLineValue>}
    </MetaLineWrap>
  );
}

function BankAccountBalance({ amount, loading }) {
  return (
    <BankAccountBalanceWrap>
      <BankAccountBalanceAmount
        className={clsx({
          [Classes.SKELETON]: loading,
        })}
      >
        {amount}
      </BankAccountBalanceAmount>
      <BankAccountBalanceLabel>{intl.get('balance')}</BankAccountBalanceLabel>
    </BankAccountBalanceWrap>
  );
}

function BankAccountTypeIcon({ type, subtype }) {
  const isClearing = subtype === BANK_ACCOUNT_SUBTYPE.CLEARING;
  const icon = isClearing ? CLEARING_BADGE.icon : ACCOUNT_TYPE_PAIR_ICON[type];
  const colors = isClearing
    ? CLEARING_BADGE.colors
    : ACCOUNT_TYPE_BADGE_COLORS[type];

  if (!icon) {
    return null;
  }
  return (
    <AccountIconWrap style={colors ? { background: colors.bg } : undefined}>
      <Icon icon={icon} iconSize={16} color={colors?.fg} />
    </AccountIconWrap>
  );
}

export function BankAccount({
  title,
  code,
  type,
  subtype,
  balance,
  loading = false,
  updatedBeforeText,
  uncategorizedTransactionsCount,
  ...restProps
}) {
  return (
    <BankAccountWrap {...restProps}>
      <BankAccountHeader>
        <BankAccountTitle className={clsx({ [Classes.SKELETON]: loading })}>
          {title}
        </BankAccountTitle>
        <BankAccountCode className={clsx({ [Classes.SKELETON]: loading })}>
          {code}
        </BankAccountCode>
        {!loading && <BankAccountTypeIcon type={type} subtype={subtype} />}
      </BankAccountHeader>

      <BankAccountMeta>
        {uncategorizedTransactionsCount > 0 && (
          <BankAccountMetaLine
            title={intl.get('banking.transactions_for_review')}
            value={uncategorizedTransactionsCount}
            className={clsx({ [Classes.SKELETON]: loading })}
          />
        )}
        {updatedBeforeText && (
          <BankAccountMetaLine
            title={updatedBeforeText}
            className={clsx({ [Classes.SKELETON]: loading })}
          />
        )}
      </BankAccountMeta>

      <BankAccountBalance amount={balance} loading={loading} />
    </BankAccountWrap>
  );
}

const BankAccountWrap = styled.div`
  width: 225px;
  height: 180px;
  display: flex;
  flex-direction: column;
  border-radius: 3px;
  background: var(--color-bank-account-card-background);
  margin: 8px;
  border: 1px solid var(--color-bank-account-card-border);
  transition: all 0.1s ease-in-out;
  color: var(--color-bank-account-card-text);

  &:hover {
    border-color: var(--color-bank-account-card-hover-border);
  }
`;

const BankAccountHeader = styled.div`
  padding: 10px 12px;
  padding-top: 16px;
  position: relative;
`;

const BankAccountTitle = styled.div`
  font-size: 15px;
  font-style: inherit;
  letter-spacing: -0.003em;
  white-space: nowrap;
  font-weight: 600;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0px;
  padding-right: 40px;
`;

const BankAccountCode = styled.div`
  font-size: 11px;
  margin-top: 4px;
  color: var(--color-bank-account-code-text);
  display: inline-block;
`;

const BankAccountBalanceWrap = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: auto;
  border-top: 1px solid var(--color-bank-account-card-border);
  padding: 10px 12px;
`;

const BankAccountBalanceAmount = styled.div`
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
`;

const BankAccountBalanceLabel = styled.div`
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
  margin-top: 3px;
  opacity: 0.6;
`;

const MetaLineWrap = styled.div`
  font-size: 11px;
  display: flex;

  &:not(:first-of-type) {
    margin-top: 6px;
  }
`;
const MetaLineTitle = styled.div``;

const MetaLineValue = styled.div`
  box-sizing: border-box;
  font-style: inherit;
  background: var(--color-bank-account-card-tag-background);
  line-height: initial;
  align-content: center;
  padding: 0px 2px;
  border-radius: 9.6px;
  font-weight: normal;
  text-transform: none;
  width: 30px;
  min-width: 30px;
  height: 16px;
  text-align: center;
  font-size: 11px;
  margin-left: auto;
`;

const BankAccountMeta = styled.div`
  padding: 0 12px 10px;
`;

export const BankAccountsList = styled.div`
  display: flex;
  margin: -8px;
  flex-wrap: wrap;
`;

const AccountIconWrap = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #abb3bb;
`;
