import * as R from 'ramda';
import { ProfitLossSheetQuery } from './ProfitLossSheetQuery';
import { GConstructor } from '@/common/types/Constructor';
import { FinancialSheet } from '../../common/FinancialSheet';
import { ITableColumn, ITableColumnAccessor } from '../../types/Table.types';
import { IDateRange } from '../CashFlowStatement/Cashflow.types';
import { FinancialTablePreviousYear } from '../../common/FinancialTablePreviousYear';
import { FinancialDateRanges } from '../../common/FinancialDateRanges';

export const ProfitLossTablePreviousYear = <
  T extends GConstructor<FinancialSheet>,
>(
  Base: T,
) =>
  class extends R.pipe(FinancialTablePreviousYear, FinancialDateRanges)(Base) {
    query: ProfitLossSheetQuery;

    // ------------------------------------
    // # Columns.
    // ------------------------------------
    /**
     * Retrieves pervious year comparison columns.
     * @returns {ITableColumn[]}
     */
    protected getPreviousYearColumns = (
      dateRange?: IDateRange,
    ): ITableColumn[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous year columns.
        R.append(this.getPreviousYearTotalColumn(dateRange)),
        R.when(
          this.query.isPreviousYearChangeActive,
          R.append(this.getPreviousYearChangeColumn()),
        ),
        R.when(
          this.query.isPreviousYearPercentageActive,
          R.append(this.getPreviousYearPercentageColumn()),
        ),
      )([]) as ITableColumn[];
    };

    /**
     * Compose the previous year for date periods columns.
     * @param {IDateRange} dateRange
     * @returns {ITableColumn[]}
     */
    private previousYearDatePeriodColumnCompose = (
      dateRange: IDateRange,
    ): ITableColumn[] => {
      const PYDateRange = this.getPreviousYearDateRange(
        dateRange.fromDate,
        dateRange.toDate,
      );
      return this.getPreviousYearColumns(PYDateRange);
    };

    /**
     * Retrieves previous year date periods columns.
     * @param {IDateRange} dateRange
     * @returns {ITableColumn[]}
     */
    protected getPreviousYearDatePeriodColumnPlugin = (
      dateRange: IDateRange,
    ): ITableColumn[] => {
      return this.previousYearDatePeriodColumnCompose(dateRange);
    };

    // ---------------------------------------------------
    // # Accessors.
    // ---------------------------------------------------
    /**
     * Retrieves previous year columns accessors.
     * @returns {ITableColumnAccessor[]}
     */
    protected previousYearColumnAccessor = (): ITableColumnAccessor[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous year columns.
        R.append(this.getPreviousYearTotalAccessor()),
        R.when(
          this.query.isPreviousYearChangeActive,
          R.append(this.getPreviousYearChangeAccessor()),
        ),
        R.when(
          this.query.isPreviousYearPercentageActive,
          R.append(this.getPreviousYearPercentageAccessor()),
        ),
      )([]) as ITableColumnAccessor[];
    };

    /**
     * Previous year period column accessor.
     * @param {number} index
     * @returns {ITableColumn[]}
     */
    protected previousYearHorizontalColumnAccessors = (
      index: number,
    ): ITableColumnAccessor[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous year columns.
        R.append(this.getPreviousYearTotalHorizAccessor(index)),
        R.when(
          this.query.isPreviousYearChangeActive,
          R.append(this.getPreviousYearChangeHorizAccessor(index)),
        ),
        R.when(
          this.query.isPreviousYearPercentageActive,
          R.append(this.getPreviousYearPercentageHorizAccessor(index)),
        ),
      )([]) as ITableColumnAccessor[];
    };
  };
