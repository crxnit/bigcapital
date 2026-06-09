// @ts-nocheck
import React from 'react';
import moment from 'moment';
import intl from 'react-intl-universal';

/**
 * Format the given date.
 *
 * Parses strictly as ISO-8601 (or a Date/moment object) — the only thing GL
 * rows and transformers emit as a RAW date. Anything else (e.g. a server-side
 * already-formatted "June 09, 2026") is returned verbatim instead of being fed
 * back into `moment()`, which would trip moment's RFC2822/ISO deprecation
 * warning and an unreliable `new Date()` fallback (BUG-018). Many tables pass
 * a `formatted_*_date` accessor here, so this guard keeps them quiet + correct.
 */
export function FormatDate({ value, format = 'YYYY MMM DD' }) {
  const localizedFormat = intl.get(`date_formats.${format}`);
  const parsed = moment(value, moment.ISO_8601, true);

  return parsed.isValid() ? parsed.format(localizedFormat) : value;
}

/**
 * Format date table cell.
 */
export function FormatDateCell({ value, column: { formatDate } }) {
  return <FormatDate value={value} {...formatDate} />;
}
