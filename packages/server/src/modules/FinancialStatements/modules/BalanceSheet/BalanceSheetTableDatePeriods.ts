import * as R from 'ramda';
import * as moment from 'moment';
import { I18nService } from 'nestjs-i18n';
import { ITableColumn, ITableColumnAccessor } from '../../types/Table.types';
import { FinancialDatePeriods } from '../../common/FinancialDatePeriods';
import {
  IDateRange,
  ICashFlowDateRange,
} from '../CashFlowStatement/Cashflow.types';
import { GConstructor } from '@/common/types/Constructor';
import { FinancialSheet } from '../../common/FinancialSheet';
import { BalanceSheetQuery } from './BalanceSheetQuery';

export const BalanceSheetTableDatePeriods = <
  T extends GConstructor<FinancialSheet>,
>(
  Base: T,
) =>
  class extends R.pipe(FinancialDatePeriods)(Base) {
    public i18n: I18nService;

    // Members provided at runtime by sibling mixins composed into the concrete
    // `BalanceSheetTable` class (`BalanceSheetTablePercentage`,
    // `BalanceSheetTablePreviousPeriod`, `BalanceSheetTablePreviousYear`).
    // Declared (type only, no runtime emit) so this mixin's methods can use them.
    declare query: BalanceSheetQuery;
    declare percentageColumns: () => ITableColumn[];
    declare percetangeDatePeriodColumnsAccessor: (
      index: number,
    ) => ITableColumnAccessor[];
    declare previousPeriodHorizColumnAccessors: (
      index: number,
    ) => ITableColumnAccessor[];
    declare previousPeriodHorizontalColumns: (
      dateRange: IDateRange,
    ) => ITableColumn[];
    declare previousYearHorizontalColumnAccessors: (
      index: number,
    ) => ITableColumnAccessor[];
    declare getPreviousYearHorizontalColumns: (
      dateRange: IDateRange,
    ) => ITableColumn[];

    /**
     * Retrieves the date periods based on the report query.
     * @returns {IDateRange[]}
     */
    get datePeriods() {
      return this.getDateRanges(
        this.query.fromDate,
        this.query.toDate,
        this.query.displayColumnsBy,
      );
    }

    /**
     * Retrieve the formatted column label from the given date range.
     * @param {ICashFlowDateRange} dateRange -
     * @return {string}
     */
    public formatColumnLabel = (dateRange: ICashFlowDateRange) => {
      const monthFormat = (range) => moment(range.toDate).format('YYYY-MM');
      const yearFormat = (range) => moment(range.toDate).format('YYYY');
      const dayFormat = (range) => moment(range.toDate).format('YYYY-MM-DD');

      const conditions = [
        ['month', monthFormat],
        ['year', yearFormat],
        ['day', dayFormat],
        ['quarter', monthFormat],
        ['week', dayFormat],
      ];
      const conditionsPairs = R.map(
        ([type, formatFn]) => [
          R.always(this.query.isDisplayColumnsBy(type as string)),
          formatFn,
        ],
        conditions,
      ) as unknown as Array<
        [
          (range: ICashFlowDateRange) => boolean,
          (range: ICashFlowDateRange) => string,
        ]
      >;
      return R.compose(R.cond(conditionsPairs))(dateRange);
    };

    // -------------------------
    // # Accessors.
    // -------------------------
    /**
     * Date period columns accessor.
     * @param {IDateRange} dateRange -
     * @param {number} index -
     */
    public datePeriodColumnsAccessor = R.curry(
      (dateRange: IDateRange, index: number) => {
        return R.pipe(
          R.concat(this.previousPeriodHorizColumnAccessors(index)),
          R.concat(this.previousYearHorizontalColumnAccessors(index)),
          R.concat(this.percetangeDatePeriodColumnsAccessor(index)),
          R.concat([
            {
              key: `date-range-${index}`,
              accessor: `horizontalTotals[${index}].total.formattedAmount`,
            },
          ]),
        )([] as ITableColumnAccessor[]) as unknown as ITableColumnAccessor[];
      },
    );

    /**
     * Retrieve the date periods columns accessors.
     * @returns {ITableColumnAccessor[]}
     */
    public datePeriodsColumnsAccessors = (): ITableColumnAccessor[] => {
      // `R.addIndex(R.map)(curriedFn)` types as a `Curry<>`; assert the plain
      // indexed-mapping function it is at runtime.
      const mapIndexed = R.addIndex(R.map)(this.datePeriodColumnsAccessor) as (
        list: IDateRange[],
      ) => ITableColumnAccessor[][];

      // `R.compose(R.flatten, …)` loses its element type through the ramda
      // typings; the runtime value is a flat accessor array.
      return R.compose(
        R.flatten,
        mapIndexed,
      )(this.datePeriods) as unknown as ITableColumnAccessor[];
    };

    // -------------------------
    // # Columns.
    // -------------------------
    /**
     *
     * @param {number} index
     * @param {} dateRange
     * @returns {}
     */
    public datePeriodChildrenColumns = (
      index: number,
      dateRange: IDateRange,
    ) => {
      return R.compose(
        R.unless(
          R.isEmpty,
          R.concat([
            { key: `total`, label: this.i18n.t('balance_sheet.total') },
          ]),
        ),
        R.concat(this.percentageColumns()),
        R.concat(this.getPreviousYearHorizontalColumns(dateRange)),
        R.concat(this.previousPeriodHorizontalColumns(dateRange)),
      )([] as ITableColumn[]) as unknown as ITableColumn[];
    };

    /**
     *
     * @param dateRange
     * @param index
     * @returns
     */
    public datePeriodColumn = (
      dateRange: IDateRange,
      index: number,
    ): ITableColumn => {
      return {
        key: `date-range-${index}`,
        label: this.formatColumnLabel(dateRange),
        children: this.datePeriodChildrenColumns(index, dateRange),
      };
    };

    /**
     * Date periods columns.
     * @returns {ITableColumn[]}
     */
    public datePeriodsColumns = (): ITableColumn[] => {
      return this.datePeriods.map(this.datePeriodColumn);
    };
  };
