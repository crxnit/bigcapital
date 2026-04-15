// @ts-nocheck
import React, { useContext } from 'react';
import classNames from 'classnames';
import TableContext from './TableContext';

/**
 * Table footer.
 */
export default function TableFooter() {
  const {
    props: { footer },
    table: { footerGroups },
  } = useContext(TableContext);

  // Can't contiunue if the footer is disabled.
  if (!footer) { return null; }
  
  return (
    <div className="tfooter">
      {footerGroups.map((group) => {
        const { key: groupKey, ...groupProps } = group.getFooterGroupProps({
          className: 'tr',
        });
        return (
          <div key={groupKey} {...groupProps}>
            {group.headers.map((column) => {
              const { key: colKey, ...colProps } = column.getFooterProps({
                className: classNames(column.className || '', 'td'),
              });
              return (
                <div key={colKey} {...colProps}>
                  <div className={'cell-inner'}>
                    {column.render('Footer')}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
