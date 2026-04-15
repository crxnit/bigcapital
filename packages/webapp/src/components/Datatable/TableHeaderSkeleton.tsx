// @ts-nocheck
import React, { useContext } from 'react';
import clsx from 'classnames';
import TableContext from './TableContext';
import { Skeleton } from '@/components';

function TableHeaderCell({ column }) {
  const { skeletonWidthMax = 100, skeletonWidthMin = 40 } = column;
  const { key: headerPropsKey, ...headerProps } = column.getHeaderProps({
    className: clsx(
      'th',
      {
        [`align-${column.align}`]: column.align,
      },
      column.className,
    ),
  });

  return (
    <div key={headerPropsKey} {...headerProps}>
      <Skeleton minWidth={skeletonWidthMin} maxWidth={skeletonWidthMax} />
    </div>
  );
}

/**
 * Table skeleton rows.
 */
export function TableSkeletonHeader({}) {
  const {
    table: { headerGroups },
  } = useContext(TableContext);

  return (
    <div className="thead">
      {headerGroups.map((headerGroup, hgIndex) => {
        const { key: groupKey, ...groupProps } = headerGroup.getHeaderGroupProps({
          className: 'tr',
        });
        return (
          <div key={groupKey ?? headerGroup.id ?? hgIndex} {...groupProps}>
            {headerGroup.headers.map((column) => (
              <TableHeaderCell key={column.id} column={column} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
