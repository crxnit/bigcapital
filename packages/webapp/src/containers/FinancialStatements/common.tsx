// @ts-nocheck
import * as R from 'ramda';
import moment from 'moment';
import { displayColumnsByOptions } from './constants';
import { transfromToSnakeCase, flatten } from '@/utils';

/**
 * Associate display columns by and type properties to query object.
 */
export const transformDisplayColumnsType = (form) => {
  const columnType = R.find(
    R.propEq('key', form.displayColumnsType),
    displayColumnsByOptions,
  );
  return R.pipe(
    R.mergeRight(form),
    R.when(
      () => R.pathOr(false, ['by'], columnType),
      R.assoc('displayColumnsBy', columnType?.by),
    ),
    R.assoc('displayColumnsType', R.propOr('total', 'type', columnType)),
  )({});
};

/**
 * Associate none zero and none transaction property to query.
 */
const setNoneZeroTransactions = (form) => {
  return {
    ...form,
    noneZero: form.filterByOption === 'without-zero-balance',
    noneTransactions: form.filterByOption === 'with-transactions',
    onlyActive: form.filterByOption === 'with-only-active',
  };
};
// filterByOption
export const transformAccountsFilter = (form) => {
  return R.compose(R.omit(['filterByOption']), setNoneZeroTransactions)(form);
};

/**
 * Transform filter form to http query.
 */
export const transformFilterFormToQuery = (form) => {
  return R.compose(
    transfromToSnakeCase,
    transformAccountsFilter,
    transformDisplayColumnsType,
  )(form);
};

/**
 * Build a descriptive download filename for a report PDF from the same snake_case
 * httpQuery the dialogs already hold. Supports both range (from_date/to_date) and
 * as-of (as_date) reports, optional basis, and a generation timestamp to keep
 * re-downloads from colliding.
 */
export const buildReportPdfFilename = (reportSlug, httpQuery = {}) => {
  const parts = [reportSlug];
  const { from_date, to_date, as_date, basis, accounting_method } = httpQuery;

  if (from_date && to_date) {
    parts.push(from_date, 'to', to_date);
  } else if (as_date) {
    parts.push('as-of', as_date);
  }

  const basisValue = basis || accounting_method;
  if (basisValue) parts.push(basisValue);

  parts.push(moment().format('YYYY-MM-DD-HHmm'));

  return `${parts.join('_')}.pdf`;
};
