// @ts-nocheck
import { css } from '@emotion/css';
import { x } from '@xstyled/emotion';
import {
  FFormGroup,
  FInputGroup,
  FSelect,
  TotalLinePrimitive,
} from '@/components';
import { Button } from '@blueprintjs/core';
import { useIsDarkMode } from '@/hooks/useDarkMode';

const inputGroupCss = css`
  & .bp4-input {
    max-width: 110px;
    padding-left: 8px;
  }
`;
const formGroupCss = css`
  margin-bottom: 0;
`;

interface DiscountTotalLineProps {
  currencyCode: string;
  discountAmount: number;
}

export function DiscountTotalLine({
  currencyCode,
  discountAmount,
}: DiscountTotalLineProps) {
  // Render the unit selector as an obviously-interactive toggle. The prior
  // minimal-no-icon version rendered as just the currency code (e.g. "USD")
  // and was indistinguishable from a static label — users routinely typed a
  // number meaning "percent" and got a fixed-amount discount instead. A small
  // border + caret signals it's a dropdown without crowding the row.
  const discountButtonInput = ({ text }) => (
    <Button
      small
      rightIcon="caret-down"
      className={css`
        &.bp4-small {
          font-size: 12px;
        }
      `}
    >
      {text}
    </Button>
  );

  const discountTypeItems = [
    { text: currencyCode, value: 'amount', label: 'Fixed Amount' },
    { text: '%', value: 'percentage', label: 'Percentage' },
  ];

  const isDarkMode = useIsDarkMode();

  return (
    <TotalLinePrimitive>
      <TotalLinePrimitive.Title
        borderBottom={'1px solid var(--x-border-bottom-color)'}
        style={{
          '--x-border-bottom-color': isDarkMode
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgb(210, 221, 226)',
        }}
      >
        <x.div
          display={'flex'}
          alignItems={'center'}
          justifyContent={'space-between'}
        >
          <x.span pr={2}>Discount</x.span>
          <FFormGroup
            name={'discount'}
            className={formGroupCss}
            inline
            fastField
          >
            <FInputGroup
              name={'discount'}
              rightElement={
                <FSelect
                  name={'discount_type'}
                  items={discountTypeItems}
                  input={discountButtonInput}
                  filterable={false}
                />
              }
              fastField
              className={inputGroupCss}
            />
          </FFormGroup>
        </x.div>
      </TotalLinePrimitive.Title>

      <TotalLinePrimitive.Amount
        textAlign={'right'}
        borderBottom={'1px solid var(--x-border-bottom-color)'}
        style={{
          '--x-border-bottom-color': isDarkMode
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgb(210, 221, 226)',
        }}
      >
        {discountAmount}
      </TotalLinePrimitive.Amount>
    </TotalLinePrimitive>
  );
}
