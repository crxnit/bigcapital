// @ts-nocheck
import { repeatValue, transformToForm } from '@/utils';

/**
 * Shared form-utility helpers for the "direct-account allocations" pattern
 * shared by Bill, VendorCredit, SaleInvoice, and (soon) CreditNote.
 *
 * Each parent form duplicates the same four operations against its own
 * `categories: []` Formik field; the only axis of variation is the FK
 * field name (`expense_account_id` vs `income_account_id` snake-case on
 * the webapp). Parameterise that and a new caller wires up via four
 * one-line helper calls instead of cloning the four operations a fourth
 * time.
 */

export const MIN_CATEGORY_LINES = 1;

/**
 * Default row shape for the categories editor table. `accountField` is
 * the snake-case FK column name the form serialises (e.g.
 * `expense_account_id`, `income_account_id`).
 */
export const makeDefaultAllocationCategory = (accountField: string) => ({
  index: 0,
  [accountField]: '',
  description: '',
  amount: '',
});

/**
 * Drops blank rows (rows where either the account or the amount is
 * empty). Use before submit so the request body never carries the
 * always-present trailing empty row.
 */
export const filterNonZeroAllocations = (
  categories: any[] = [],
  accountField: string,
) => {
  return categories.filter(
    (cat) => cat?.[accountField] && Number(cat?.amount) > 0,
  );
};

/**
 * Shapes the form's categories array for the API. Preserves `id` so
 * upsertGraph updates in place; index assigned by row order.
 */
export const transformAllocationsToSubmit = (
  categories: any[] = [],
  accountField: string,
) => {
  return categories.map((cat, i) => ({
    ...(cat.id != null ? { id: cat.id } : {}),
    index: i + 1,
    [accountField]: cat[accountField],
    description: cat.description ?? '',
    amount: Number(cat.amount) || 0,
  }));
};

/**
 * Hydrates the server's categories array for the edit form. Preserves
 * the server `id` on each row so the next save's upsertGraph updates in
 * place rather than deleting and recreating. Pads with a single empty
 * row if the server returned none (so the editor always shows a row to
 * fill in).
 */
export const hydrateAllocationsForEdit = (
  categories: any[] = [],
  accountField: string,
  minLines: number = MIN_CATEGORY_LINES,
) => {
  const defaultRow = makeDefaultAllocationCategory(accountField);
  if (!categories || categories.length === 0) {
    return [...repeatValue(defaultRow, minLines)];
  }
  return categories.map((category) => ({
    ...(category.id != null ? { id: category.id } : {}),
    ...transformToForm(category, defaultRow),
  }));
};
