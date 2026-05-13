// @ts-nocheck
type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

export type Separator = ',' | '.';

export type CurrencyInputProps = Overwrite<
  React.InputHTMLAttributes<HTMLInputElement>,
  {
    /**
     * Allow decimals
     *
     * Default = true
     */
    allowDecimals?: boolean;

    /**
     * Allow user to enter negative value
     *
     * Default = true
     */
    allowNegativeValue?: boolean;

    /**
     * Component id
     */
    id?: string;

    /**
     *  Maximum characters the user can enter
     */
    maxLength?: number;

    /**
     * Class names
     */
    className?: string;

    /**
     * Limit length of decimals allowed
     *
     * Default = 2
     */
    decimalsLimit?: number;

    /**
     * Default value
     */
    defaultValue?: number | string;

    /**
     * Disabled
     *
     * Default = false
     */
    disabled?: boolean;

    /**
     * Value will always have the specified length of decimals.
     * NOTE: this triggers "cents-mode" — typing "100" on blur becomes
     * "1.00" (interpreted as 100 cents). Use `displayDecimalLength`
     * below if you want zero-padding for accounting-style display
     * without the cents-mode reinterpretation.
     */
    fixedDecimalLength?: number;

    /**
     * Pad / trim decimals to this length AT RENDER TIME only. Doesn't
     * change how typing or blur are handled (no cents-mode). Use this
     * when you just want `100` to display as `100.00` after blur but
     * still want the user to enter dollar values directly.
     */
    displayDecimalLength?: number;

    /**
     * Handle change in value
     */
    onChange?: (value: string | undefined, name?: string) => void;

    /**
     * Handle value onBlur
     *
     */
    onBlurValue?: (value: string | undefined, name?: string) => void;

    /**
     * Placeholder
     */
    placeholder?: string;

    /**
     * Specify decimal precision for padding/trimming
     */
    precision?: number;

    /**
     * Include a prefix eg. £
     */
    prefix?: string;

    /**
     * Incremental value change on arrow down and arrow up key press
     */
    step?: number;

    /**
     * Separator between integer part and fractional part of value. Cannot be a number
     *
     * Default = "."
     */
    decimalSeparator?: string;

    /**
     * Separator between thousand, million and billion. Cannot be a number
     *
     * Default = ","
     */
    groupSeparator?: string;

    /**
     * Disable auto adding separator between values eg. 1000 > 1,000
     *
     * Default = false
     */
    turnOffSeparators?: boolean;

    /**
     * Disable abbreviations eg. 1k > 1,000, 2m > 2,000,000
     *
     * Default = false
     */
    turnOffAbbreviations?: boolean;
  }
>;
