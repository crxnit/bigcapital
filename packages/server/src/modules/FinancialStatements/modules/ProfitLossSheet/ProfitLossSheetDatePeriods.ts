import * as R from 'ramda';
import * as moment from 'moment';
import { sumBy } from 'lodash';
import {
  IProfitLossHorizontalDatePeriodNode,
  IProfitLossSheetAccountNode,
  IProfitLossSheetAccountsNode,
  IProfitLossSheetCommonNode,
  IProfitLossSheetNode,
  IProfitLossSheetQuery,
} from './ProfitLossSheet.types';
import { FinancialSheet } from '../../common/FinancialSheet';
import { GConstructor } from '@/common/types/Constructor';
import { FinancialDatePeriods } from '../../common/FinancialDatePeriods';
import { IDateRange } from '../../types/Report.types';
import { IFinancialSheetTotalPeriod } from '../BalanceSheet/BalanceSheet.types';
import { ProfitLossSheetRepository } from './ProfitLossSheetRepository';
import { ProfitLossSheetQuery } from './ProfitLossSheetQuery';

export const ProfitLossSheetDatePeriods = <
  T extends GConstructor<FinancialSheet>,
>(
  Base: T,
) =>
  class extends R.pipe(FinancialDatePeriods)(Base) {
    query: ProfitLossSheetQuery;
    repository: ProfitLossSheetRepository;

    // Methods provided at runtime by the `FinancialEvaluateEquation` mixin
    // composed into the concrete `ProfitLossSheet` class. Declared (type only,
    // no runtime emit) so they are visible to this mixin's methods.
    declare getNodesTableForEvaluating: (
      path: string,
      nodes: IProfitLossSheetNode[],
    ) => { [key: string | number]: number };
    declare evaluateEquation: (
      equation: string,
      scope: { [key: string | number]: number },
    ) => number;

    /**
     * Retrieves the date periods based on the report query.
     * @returns {IDateRange[]}
     */
    get datePeriods(): IDateRange[] {
      return this.getDateRanges(
        this.query.fromDate,
        this.query.toDate,
        this.query.displayColumnsBy,
      );
    }

    /**
     * Retrieves the date periods of the given node based on the report query.
     * @param   {IProfitLossSheetCommonNode} node
     * @param   {Function} callback
     * @returns {}
     */
    protected getReportNodeDatePeriods = (
      node: IProfitLossSheetCommonNode,
      // Accepts either a plain `(node, fromDate, toDate, index)` callback or a
      // ramda-curried equivalent (whose `Curry<>` type is not assignable to the
      // plain function signature).
      callback: (...args: any[]) => any,
    ): IProfitLossHorizontalDatePeriodNode[] => {
      // `getNodeDatePeriods` is a fully-applied ramda-curried mixin method; its
      // declared `Curry<>` type does not collapse to the result on full
      // application, so assert the concrete period-array result type.
      return this.getNodeDatePeriods(
        this.query.fromDate as unknown as Date,
        this.query.toDate as unknown as Date,
        this.query.displayColumnsBy,
        node,
        callback,
      ) as unknown as IProfitLossHorizontalDatePeriodNode[];
    };

    // --------------------------
    // # Account Nodes.
    // --------------------------
    /**
     * Retrieve account node date period total.
     * @param   {IProfitLossSheetAccount} node
     * @param   {Date} fromDate
     * @param   {Date} toDate
     * @returns {}
     */
    private getAccountNodeDatePeriodTotal = (
      node: IProfitLossSheetAccountNode,
      fromDate: Date,
      toDate: Date,
    ) => {
      const periodTotal = this.repository.periodsAccountsLedger
        .whereAccountId(node.id as number)
        .whereFromDate(fromDate)
        .whereToDate(toDate)
        .getClosingBalance();

      return this.getDatePeriodTotalMeta(periodTotal, fromDate, toDate);
    };

    /**
     * Retrieve account node date period.
     * @param {IProfitLossSheetAccountNode} node
     * @returns {IProfitLossSheetAccountNode}
     */
    public getAccountNodeDatePeriod = (node: IProfitLossSheetAccountNode) => {
      return this.getReportNodeDatePeriods(
        node,
        this.getAccountNodeDatePeriodTotal,
      );
    };

    /**
     * Account date periods to the given account node.
     * @param   {IProfitLossSheetAccountNode} node
     * @returns {IProfitLossSheetAccountNode}
     */
    public assocAccountNodeDatePeriod = (
      node: IProfitLossSheetAccountNode,
    ): IProfitLossSheetAccountNode => {
      const datePeriods = this.getAccountNodeDatePeriod(node);

      return R.assoc('horizontalTotals', datePeriods, node);
    };

    // --------------------------
    // # Aggregate nodes.
    // --------------------------
    /**
     * Retrieves sumation of the given aggregate node children totals.
     * @param {IProfitLossSheetAccountsNode} node
     * @param {number} index
     * @returns {number}
     */
    private getAggregateDatePeriodIndexTotal = (
      node: IProfitLossSheetAccountsNode,
      index: number,
    ): number => {
      return sumBy(node.children, `horizontalTotals[${index}].total.amount`);
    };

    /**
     *
     * @param {IProfitLossSheetAccount} node
     * @param {Date} fromDate
     * @param {Date} toDate
     * @param {number} index
     * @returns  {IProfitLossSheetAccount}
     */
    private getAggregateNodeDatePeriodTotal = R.curry(
      (
        node: IProfitLossSheetAccountsNode,
        fromDate: Date,
        toDate: Date,
        index: number,
      ): IProfitLossHorizontalDatePeriodNode => {
        const periodTotal = this.getAggregateDatePeriodIndexTotal(node, index);

        return this.getDatePeriodTotalMeta(periodTotal, fromDate, toDate);
      },
    );

    /**
     * Retrieves aggregate horizontal date periods.
     * @param {IProfitLossSheetAccountsNode} node
     * @returns {IProfitLossSheetAccountsNode}
     */
    private getAggregateNodeDatePeriod = (
      node: IProfitLossSheetAccountsNode,
    ): IProfitLossHorizontalDatePeriodNode[] => {
      return this.getReportNodeDatePeriods(
        node,
        this.getAggregateNodeDatePeriodTotal,
      );
    };

    /**
     * Assoc horizontal date periods to aggregate node.
     * @param   {IProfitLossSheetAccountsNode} node
     * @returns {IProfitLossSheetAccountsNode}
     */
    protected assocAggregateDatePeriod = (
      node: IProfitLossSheetAccountsNode,
    ): IProfitLossSheetAccountsNode => {
      const datePeriods = this.getAggregateNodeDatePeriod(node);

      return R.assoc('horizontalTotals', datePeriods, node);
    };

    // --------------------------
    // # Equation nodes.
    // --------------------------
    /**
     * Retrieves equation date period node.
     * @param {IProfitLossSheetNode[]} accNodes
     * @param {IProfitLossSheetNode} node
     * @param {Date} fromDate
     * @param {Date} toDate
     * @param {number} index
     * @returns {IProfitLossHorizontalDatePeriodNode}
     */
    private getEquationNodeDatePeriod = R.curry(
      (
        accNodes: IProfitLossSheetNode[],
        equation: string,
        node: IProfitLossSheetNode,
        fromDate: Date,
        toDate: Date,
        index: number,
      ): IProfitLossHorizontalDatePeriodNode => {
        const tableNodes = this.getNodesTableForEvaluating(
          `horizontalTotals[${index}].total.amount`,
          accNodes,
        );
        // Evaluate the given equation.
        const total = this.evaluateEquation(equation, tableNodes);

        return this.getDatePeriodTotalMeta(total, fromDate, toDate);
      },
    );

    /**
     * Retrieves the equation node date periods.
     * @param {IProfitLossSheetNode[]} node
     * @param {string} equation
     * @param {IProfitLossSheetNode} node
     * @returns {IProfitLossHorizontalDatePeriodNode[]}
     */
    private getEquationNodeDatePeriods = R.curry(
      (
        accNodes: IProfitLossSheetNode[],
        equation: string,
        node: IProfitLossSheetNode,
      ): IProfitLossHorizontalDatePeriodNode[] => {
        return this.getReportNodeDatePeriods(
          node,
          this.getEquationNodeDatePeriod(accNodes, equation),
        );
      },
    );

    /**
     * Assoc equation node date period.
     * @param {IProfitLossSheetNode[]}
     * @param {IProfitLossSheetNode} node
     * @returns {IProfitLossSheetNode}
     */
    protected assocEquationNodeDatePeriod = R.curry(
      (
        accNodes: IProfitLossSheetNode[],
        equation: string,
        node: IProfitLossSheetNode,
      ): IProfitLossSheetNode => {
        const periods = this.getEquationNodeDatePeriods(
          accNodes,
          equation,
          node,
        );
        return R.assoc('horizontalTotals', periods, node);
      },
    );
  };
