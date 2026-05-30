// @ts-nocheck
import * as Yup from 'yup';
import intl from 'react-intl-universal';
import { DATATYPES_LENGTH } from '@/constants/dataTypes';
import { BANK_ACCOUNT_SUBTYPE } from '@/constants/accountTypes';

const Schema = Yup.object().shape({
  name: Yup.string()
    .required()
    .min(3)
    .max(DATATYPES_LENGTH.STRING)
    .label(intl.get('account_name_')),
  code: Yup.string().nullable().min(3).max(6),
  account_type: Yup.string().required().label(intl.get('account_type')),
  description: Yup.string().min(3).max(DATATYPES_LENGTH.TEXT).nullable().trim(),
  parent_account_id: Yup.number().nullable(),
  // Empty string is the no-subtype sentinel (form default + reset on type
  // change); allow it and null alongside the known subtype keys.
  bank_account_subtype: Yup.string()
    .nullable()
    .oneOf([...Object.values(BANK_ACCOUNT_SUBTYPE), '', null]),
});

export const CreateAccountFormSchema = Schema;
export const EditAccountFormSchema = Schema;
