// @ts-nocheck
import * as Yup from 'yup';
import { DATATYPES_LENGTH } from '@/constants/dataTypes';
import { isBlank } from '@/utils';

/**
 * Yup schema fragment for a `categories: [...]` direct-account allocations
 * field. Pass it into the form schema as
 * `categories: makeAllocationCategoriesSchema('expense_account_id')`.
 *
 * Rules:
 *   - account + amount must both be set OR both be blank (paired test) —
 *     fully-blank rows are dropped at submit by `filterNonZeroAllocations`.
 *   - amount must be ≥ 0 when set.
 *   - description capped at DATATYPES_LENGTH.TEXT.
 *
 * The paired-row test uses a single object-level `.test` instead of two
 * mutual `.when()` calls because Yup's toposort raises a cyclic-dependency
 * error when two fields reference each other via `.when()`.
 */
export const makeAllocationCategoriesSchema = (accountField: string) =>
  Yup.array().of(
    Yup.object()
      .shape({
        [accountField]: Yup.number().nullable(),
        amount: Yup.number().nullable().min(0),
        description: Yup.string().nullable().max(DATATYPES_LENGTH.TEXT),
      })
      .test('paired', 'Account and amount must both be set', (value) => {
        if (!value) return true;
        const hasAccount = !isBlank(value[accountField]);
        const hasAmount = !isBlank(value.amount) && Number(value.amount) > 0;
        return hasAccount === hasAmount;
      }),
  );
