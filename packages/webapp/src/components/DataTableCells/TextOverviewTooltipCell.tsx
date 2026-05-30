// @ts-nocheck
import React from 'react';
import { Tooltip, Position } from '@blueprintjs/core';

/**
 * Text overview tooltip cell.
 * @returns {JSX.Element}
 */
export function TextOverviewTooltipCell({ cell: { value } }) {
  const SUBMENU_POPOVER_MODIFIERS = {
    flip: { boundariesElement: 'viewport', padding: 20 },
    offset: { offset: '0, 10' },
    preventOverflow: { boundariesElement: 'viewport', padding: 40 },
  };

  // Blueprint's <Tooltip> wraps a <Popover>; a null/empty child makes the
  // Popover render with no target and log "[Blueprint] <Popover> requires
  // target prop or at least one child element." Cells like an invoice line's
  // description are routinely blank, so render the bare value when empty and
  // only wrap in a tooltip when there's content to show.
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <Tooltip
      content={value}
      position={Position.BOTTOM_LEFT}
      boundary={'viewport'}
      minimal={true}
      modifiers={SUBMENU_POPOVER_MODIFIERS}
      targetClassName={'table-tooltip-overview-target'}
    >
      {value}
    </Tooltip>
  );
}
