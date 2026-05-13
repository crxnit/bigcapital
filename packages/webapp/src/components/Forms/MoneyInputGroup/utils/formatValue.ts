// @ts-nocheck
import { addSeparators } from './addSeparators';

type Props = {
  /**
   * Value to format
   */
  value: number | string | undefined;

  /**
   * Decimal separator
   *
   * Default = '.'
   */
  decimalSeparator?: string;

  /**
   * Group separator
   *
   * Default = ','
   */
  groupSeparator?: string;

  /**
   * Turn off separators
   *
   * This will override Group separators
   *
   * Default = false
   */
  turnOffSeparators?: boolean;

  /**
   * Prefix
   */
  prefix?: string;

  /**
   * If set, pad / trim the formatted output to exactly this many decimals.
   * Without it, an integer prop value like `100` renders as `"100"`; with
   * `fixedDecimalLength: 2` it renders as `"100.00"`. Opt-in per caller so
   * existing usages (which don't set it) are unaffected.
   */
  fixedDecimalLength?: number;
};

/**
 * Format value with decimal separator, group separator and prefix
 */
export const formatValue = (props: Props): string => {
  const {
    value: _value,
    groupSeparator = ',',
    decimalSeparator = '.',
    turnOffSeparators = false,
    prefix,
    fixedDecimalLength,
  } = props;

  if (_value === '' || _value === undefined) {
    return '';
  }

  const value = String(_value);

  if (value === '-') {
    return '-';
  }

  const isNegative = RegExp('^-\\d+').test(value);
  const hasDecimalSeparator =
    decimalSeparator && value.includes(decimalSeparator);

  const valueOnly = isNegative ? value.replace('-', '') : value;
  const [int, decimals] = hasDecimalSeparator
    ? valueOnly.split(decimalSeparator)
    : [valueOnly];

  const formattedInt = turnOffSeparators
    ? int
    : addSeparators(int, groupSeparator);

  const includePrefix = prefix ? prefix : '';
  const includeNegative = isNegative ? '-' : '';

  // Pad / trim to fixedDecimalLength when opted in. Pads "100" → "100.00",
  // trims "100.123" → "100.12". Leaves the existing format-without-pad path
  // untouched for callers that don't set fixedDecimalLength.
  let includeDecimals: string;
  if (typeof fixedDecimalLength === 'number' && fixedDecimalLength >= 0) {
    const existing = decimals || '';
    const padded = existing
      .padEnd(fixedDecimalLength, '0')
      .slice(0, fixedDecimalLength);
    includeDecimals =
      fixedDecimalLength > 0 ? `${decimalSeparator}${padded}` : '';
  } else {
    includeDecimals =
      hasDecimalSeparator && decimals
        ? `${decimalSeparator}${decimals}`
        : hasDecimalSeparator
          ? `${decimalSeparator}`
          : '';
  }

  return `${includeNegative}${includePrefix}${formattedInt}${includeDecimals}`;
};
