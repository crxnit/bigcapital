// @ts-nocheck
import React, { useContext } from 'react';
import clsx from 'classnames';
import TableContext from './TableContext';
import { Skeleton } from '../Skeleton';

/**
 * Table header cell.
 */
function TableHeaderCell({ column }) {
  const { skeletonWidthMax = 100, skeletonWidthMin = 40 } = column;
  const { key: headerKey, ...headerProps } = column.getHeaderProps({
    className: clsx(
      'td',
      {
        [`align-${column.align}`]: column.align,
      },
      column.className,
    ),
  });

  return (
    <div key={headerKey} {...headerProps}>
      <Skeleton minWidth={skeletonWidthMin} maxWidth={skeletonWidthMax} />
    </div>
  );
}

/**
 * Table skeleton rows.
 */
export function TableSkeletonRows({}) {
  const {
    table: { headerGroups },
  } = useContext(TableContext);
  const skeletonRows = 10;

  return Array.from({ length: skeletonRows }).map((_, rowIndex) => {
    return headerGroups.map((headerGroup, groupIndex) => {
      const { key: groupKey, ...groupProps } = headerGroup.getHeaderGroupProps({
        className: 'tr',
      });
      return (
        <div
          key={`${rowIndex}-${groupKey ?? groupIndex}`}
          {...groupProps}
        >
          {headerGroup.headers.map((column) => (
            <TableHeaderCell key={column.id} column={column} />
          ))}
        </div>
      );
    });
  });
}
