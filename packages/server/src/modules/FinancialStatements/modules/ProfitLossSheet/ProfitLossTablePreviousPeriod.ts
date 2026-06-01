import * as R from 'ramda';
import { ITableColumn, ITableColumnAccessor } from '../../types/Table.types';
import { ProfitLossSheetQuery } from './ProfitLossSheetQuery';
import { GConstructor } from '@/common/types/Constructor';
import { FinancialTablePreviousPeriod } from '../../common/FinancialTablePreviousPeriod';
import { FinancialSheet } from '../../common/FinancialSheet';
import { IDateRange } from '../../types/Report.types';

export const ProfitLossTablePreviousPeriod = <
  T extends GConstructor<FinancialSheet>,
>(
  Base: T,
) =>
  class extends R.pipe(FinancialTablePreviousPeriod)(Base) {
    query: ProfitLossSheetQuery;

    // Provided at runtime by the `FinancialDateRanges` mixin composed into the
    // concrete `ProfitLossSheet` class. Declared (type only, no runtime emit).
    declare getPPDatePeriodDateRange: (
      fromDate: IDateRange['fromDate'],
      toDate: IDateRange['toDate'],
      unit: string,
    ) => IDateRange;

    // ----------------------------
    // # Columns
    // ----------------------------
    /**
     * Retrieves pervious period comparison columns.
     * @returns {ITableColumn[]}
     */
    protected getPreviousPeriodColumns = (
      dateRange?: IDateRange,
    ): ITableColumn[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous period columns.
        R.append(this.getPreviousPeriodTotalColumn(dateRange)),
        R.when(
          this.query.isPreviousPeriodChangeActive,
          R.append(this.getPreviousPeriodChangeColumn()),
        ),
        R.when(
          this.query.isPreviousPeriodPercentageActive,
          R.append(this.getPreviousPeriodPercentageColumn()),
        ),
      )([]) as ITableColumn[];
    };

    /**
     * Compose the previous period for date periods columns.
     * @params  {IDateRange}
     * @returns {ITableColumn[]}
     */
    protected getPreviousPeriodDatePeriodsPlugin = (
      dateRange: IDateRange,
    ): ITableColumn[] => {
      const PPDateRange = this.getPPDatePeriodDateRange(
        dateRange.fromDate,
        dateRange.toDate,
        this.query.displayColumnsBy,
      );
      return this.getPreviousPeriodColumns(PPDateRange);
    };

    // ----------------------------
    // # Accessors
    // ----------------------------
    /**
     * Retrieves previous period columns accessors.
     * @returns {ITableColumn[]}
     */
    protected previousPeriodColumnAccessor = (): ITableColumnAccessor[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous period columns.
        R.append(this.getPreviousPeriodTotalAccessor()),
        R.when(
          this.query.isPreviousPeriodChangeActive,
          R.append(this.getPreviousPeriodChangeAccessor()),
        ),
        R.when(
          this.query.isPreviousPeriodPercentageActive,
          R.append(this.getPreviousPeriodPercentageAccessor()),
        ),
      )([]) as ITableColumnAccessor[];
    };

    /**
     * Previous period period column accessor.
     * @param   {number} index
     * @returns {ITableColumn[]}
     */
    protected previousPeriodHorizontalColumnAccessors = (
      index: number,
    ): ITableColumnAccessor[] => {
      // `R.when` widens the pipe result to `readonly T[] | T[]`; the runtime
      // value is always a mutable array.
      return R.pipe(
        // Previous period columns.
        R.append(this.getPreviousPeriodTotalHorizAccessor(index)),
        R.when(
          this.query.isPreviousPeriodChangeActive,
          R.append(this.getPreviousPeriodChangeHorizAccessor(index)),
        ),
        R.when(
          this.query.isPreviousPeriodPercentageActive,
          R.append(this.getPreviousPeriodPercentageHorizAccessor(index)),
        ),
      )([]) as ITableColumnAccessor[];
    };
  };
