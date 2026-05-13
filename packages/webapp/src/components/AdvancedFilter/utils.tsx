// @ts-nocheck
import intl from 'react-intl-universal';
import {
  defaultFastFieldShouldUpdate,
  uniqueMultiProps,
  checkRequiredProperties,
} from '@/utils';

// Conditions options.
export const getConditionalsOptions = () => [
  {
    value: 'and',
    label: intl.get('and'),
    text: intl.get('filter.all_filters_must_match'),
  },
  {
    value: 'or',
    label: intl.get('or'),
    text: intl.get('filter.atleast_one_filter_must_match'),
  },
];

export const getBooleanCompatators = () => [
  { value: 'is', label: intl.get('is') },
  { value: 'is_not', label: intl.get('is_not') },
];

export const getTextCompatators = () => [
  { value: 'contain', label: intl.get('contain') },
  { value: 'not_contain', label: intl.get('not_contain') },
  { value: 'equal', label: intl.get('equals') },
  { value: 'not_equal', label: intl.get('not_equals') },
  { value: 'starts_with', label: intl.get('starts_with') },
  { value: 'ends_with', label: intl.get('ends_with') },
];

export const getDateCompatators = () => [
  { value: 'in', label: intl.get('in') },
  { value: 'after', label: intl.get('after') },
  { value: 'before', label: intl.get('before') },
];

export const getOptionsCompatators = () => [
  { value: 'is', label: intl.get('is') },
  { value: 'is_not', label: intl.get('is_not') },
];

export const getNumberCampatators = () => [
  { value: 'equal', label: intl.get('equals') },
  { value: 'not_equal', label: intl.get('not_equal') },
  { value: 'bigger_than', label: intl.get('bigger_than') },
  { value: 'bigger_or_equal', label: intl.get('bigger_or_equals') },
  { value: 'smaller_than', label: intl.get('smaller_than') },
  { value: 'smaller_or_equal', label: intl.get('smaller_or_equals') },
];

export const getConditionTypeCompatators = (dataType) => {
  return [
    ...(dataType === 'enumeration'
      ? [...getOptionsCompatators()]
      : dataType === 'date'
        ? [...getDateCompatators()]
        : dataType === 'boolean'
          ? [...getBooleanCompatators()]
          : dataType === 'number'
            ? [...getNumberCampatators()]
            : [...getTextCompatators()]),
  ];
};

export const getConditionDefaultCompatator = (dataType) => {
  const compatators = getConditionTypeCompatators(dataType);
  return compatators[0];
};

/**
 * Server-side model metas declare filter-field labels as dotted i18n keys
 * (e.g. `expense.field.payment_date`). Most of those keys aren't in
 * `lang/en/index.json` yet, so the dropdown was rendering the raw key.
 * `intl.get()` returns '' when a key is missing in react-intl-universal,
 * so we humanize the last segment as a fallback:
 *   expense.field.payment_date → Payment Date
 *   account.field.code → Code
 * When a translation eventually lands in the lang file it takes precedence.
 */
export const prettifyFieldKey = (key) => {
  if (typeof key !== 'string' || !key) return key;
  const last = key.split('.').pop();
  return last
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const transformFieldsToOptions = (fields) =>
  fields.map((field) => ({
    value: field.key,
    label: intl.get(field.name) || prettifyFieldKey(field.name),
  }));

/**
 * Filtered conditions that don't contain atleast on required fields or
 * fileds keys that not exists.
 * @param {IFilterRole[]} conditions
 * @returns
 */
export const filterConditionRoles = (conditions) => {
  const requiredProps = ['fieldKey', 'condition', 'comparator', 'value'];

  const filteredConditions = conditions.filter(
    (condition) => !checkRequiredProperties(condition, requiredProps),
  );
  return uniqueMultiProps(filteredConditions, requiredProps);
};

/**
 * Detarmines the value field when should update.
 * @returns {boolean}
 */
export const shouldFilterValueFieldUpdate = (newProps, oldProps) => {
  return (
    newProps.fieldKey !== oldProps.fieldKey ||
    defaultFastFieldShouldUpdate(newProps, oldProps)
  );
};
