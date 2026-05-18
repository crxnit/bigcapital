// @ts-nocheck
import * as Yup from 'yup';
import intl from 'react-intl-universal';
import { DATATYPES_LENGTH } from '@/constants/dataTypes';
import { isBlank } from '@/utils';

const getSchema = Yup.object().shape({
  vendor_id: Yup.number().required().label(intl.get('vendor_name_')),
  vendor_credit_date: Yup.date()
    .required()
    .label(intl.get('vendor_credit_date_')),
  vendor_credit_number: Yup.string()
    .max(DATATYPES_LENGTH.STRING)
    .label(intl.get('vendor_credit_no_')),
  reference_no: Yup.string().nullable().min(1).max(DATATYPES_LENGTH.STRING),
  note: Yup.string()
    .trim()
    .min(1)
    .max(DATATYPES_LENGTH.TEXT)
    .label(intl.get('note')),
  open: Yup.boolean(),
  branch_id: Yup.string(),
  warehouse_id: Yup.string(),
  exchange_rate: Yup.number(),
  entries: Yup.array().of(
    Yup.object().shape({
      quantity: Yup.number()
        .nullable()
        .max(DATATYPES_LENGTH.INT_10)
        .when(['rate'], {
          is: (rate) => rate,
          then: Yup.number().required(),
        }),
      rate: Yup.number().nullable().max(DATATYPES_LENGTH.INT_10),
      item_id: Yup.number()
        .nullable()
        .when(['quantity', 'rate'], {
          is: (quantity, rate) => !isBlank(quantity) && !isBlank(rate),
          then: Yup.number().required(),
        }),
      discount: Yup.number().nullable().min(0).max(DATATYPES_LENGTH.INT_10),
      description: Yup.string().nullable().max(DATATYPES_LENGTH.TEXT),
    }),
  ),
  // Direct-account allocations. An account must be picked when an amount is
  // entered (and vice versa); fully-blank rows are dropped at submit by
  // `filterNonZeroCategories`. Use a single object-level `.test` instead of
  // mutual `.when()`s — Yup toposort raises a cyclic-dependency error when
  // two fields reference each other via `.when()` (fixed for bills in
  // 2ab04caf7).
  categories: Yup.array().of(
    Yup.object()
      .shape({
        expense_account_id: Yup.number().nullable(),
        amount: Yup.number().nullable().min(0),
        description: Yup.string().nullable().max(DATATYPES_LENGTH.TEXT),
      })
      .test('paired', 'Account and amount must both be set', (value) => {
        if (!value) return true;
        const hasAccount = !isBlank(value.expense_account_id);
        const hasAmount = !isBlank(value.amount) && Number(value.amount) > 0;
        return hasAccount === hasAmount;
      }),
  ),
});

export const CreateCreditNoteFormSchema = getSchema;
export const EditCreditNoteFormSchema = getSchema;
