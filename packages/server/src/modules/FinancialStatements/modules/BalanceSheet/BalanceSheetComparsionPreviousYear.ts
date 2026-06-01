import * as R from 'ramda';
import { sumBy, isEmpty } from 'lodash';
import {
  IBalanceSheetAccountNode,
  IBalanceSheetCommonNode,
  IBalanceSheetDataNode,
  IBalanceSheetTotal,
} from './BalanceSheet.types';
import { FinancialPreviousYear } from '../../common/FinancialPreviousYear';
import { GConstructor } from '@/common/types/Constructor';
import { FinancialSheet } from '../../common/FinancialSheet';
import { BalanceSheetQuery } from './BalanceSheetQuery';
import { BalanceSheetRepository } from './BalanceSheetRepository';

export const BalanceSheetComparsionPreviousYear = <
  T extends GConstructor<FinancialSheet>,
>(
  Base: T,
) =>
  class BalanceSheetComparsionPreviousYear extends R.pipe(
    FinancialPreviousYear,
  )(Base) {
    query: BalanceSheetQuery;
    repository: BalanceSheetRepository;

    // ------------------------------
    // # Account
    // ------------------------------
    /**
     * Associates the previous year to account node.
     * @param   {IBalanceSheetDataNode} node
     * @returns {IBalanceSheetDataNode}
     */
    protected assocPreviousYearAccountNode = (
      node: IBalanceSheetDataNode,
    ): IBalanceSheetDataNode => {
      const closingBalance =
        this.repository.PYTotalAccountsLedger.whereAccountId(
          node.id as number,
        ).getClosingBalance();

      return R.assoc('previousYear', this.getAmountMeta(closingBalance), node);
    };

    /**
     * Assoc previous year attributes to account node.
     * @param {IBalanceSheetAccountNode} node
     * @returns {IBalanceSheetAccountNode}
     */
    protected previousYearAccountNodeComposer = (
      node: IBalanceSheetAccountNode,
    ): IBalanceSheetAccountNode => {
      // Sibling PY mappers are typed (via `FinancialPreviousYear`) against the
      // common financial node shape, so the heterogeneous compose chain does not
      // unify on the balance-sheet account node. Each step operates on the same
      // runtime node; assert a uniform node-mapper signature.
      type NodeMapper = (
        node: IBalanceSheetAccountNode,
      ) => IBalanceSheetAccountNode;

      return R.compose(
        R.when(
          this.isNodeHasHorizontalTotals,
          this
            .assocPreviousYearAccountHorizNodeComposer as unknown as NodeMapper,
        ),
        R.when(
          this.query.isPreviousYearPercentageActive,
          this.assocPreviousYearPercentageNode as unknown as NodeMapper,
        ),
        R.when(
          this.query.isPreviousYearChangeActive,
          this.assocPreviousYearChangetNode as unknown as NodeMapper,
        ),
        this.assocPreviousYearAccountNode as unknown as NodeMapper,
      )(node) as unknown as IBalanceSheetAccountNode;
    };

    // ------------------------------
    // # Aggregate
    // ------------------------------
    /**
     * Assoc previous year on aggregate node.
     * @param {IBalanceSheetAccountNode} node
     * @returns {IBalanceSheetAccountNode}
     */
    protected assocPreviousYearAggregateNode = (
      node: IBalanceSheetAccountNode,
    ): IBalanceSheetAccountNode => {
      const total = sumBy(node.children, 'previousYear.amount');

      return R.assoc('previousYear', this.getTotalAmountMeta(total), node);
    };

    /**
     * Assoc previous year attributes to aggregate node.
     * @param {IBalanceSheetAccountNode} node
     * @returns {IBalanceSheetAccountNode}
     */
    protected previousYearAggregateNodeComposer = (
      node: IBalanceSheetAccountNode,
    ): IBalanceSheetAccountNode => {
      // See note above: assert a uniform node-mapper signature so the
      // heterogeneous compose chain unifies on the balance-sheet node type.
      type NodeMapper = (
        node: IBalanceSheetAccountNode,
      ) => IBalanceSheetAccountNode;

      return R.compose(
        R.when(
          this.query.isPreviousYearPercentageActive,
          this.assocPreviousYearTotalPercentageNode as unknown as NodeMapper,
        ),
        R.when(
          this.query.isPreviousYearChangeActive,
          this.assocPreviousYearTotalChangeNode as unknown as NodeMapper,
        ),
        R.when(
          this.isNodeHasHorizontalTotals,
          this.assocPreviousYearAggregateHorizNode as unknown as NodeMapper,
        ),
        this.assocPreviousYearAggregateNode as unknown as NodeMapper,
      )(node) as unknown as IBalanceSheetAccountNode;
    };

    // ------------------------------
    // # Horizontal Nodes - Aggregate
    // ------------------------------
    /**
     * Assoc previous year total to horizontal node.
     * @param node
     * @returns
     */
    private assocPreviousYearAggregateHorizTotalNode = R.curry(
      (node, index, totalNode) => {
        const total = this.getPYHorizNodesTotalSumation(index, node);

        return R.assoc(
          'previousYear',
          this.getTotalAmountMeta(total),
          totalNode,
        );
      },
    );

    /**
     * Compose previous year to aggregate horizontal nodes.
     * @param   {IBalanceSheetTotal} node
     * @returns {IBalanceSheetTotal}
     */
    private previousYearAggregateHorizNodeComposer = R.curry(
      (
        node: IBalanceSheetCommonNode,
        horiontalTotalNode: IBalanceSheetTotal,
        index: number,
      ): IBalanceSheetTotal => {
        type TotalMapper = (node: IBalanceSheetTotal) => IBalanceSheetTotal;

        return R.compose(
          R.when(
            this.query.isPreviousYearPercentageActive,
            this.assocPreviousYearTotalPercentageNode as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearChangeActive,
            this.assocPreviousYearTotalChangeNode as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this.assocPreviousYearAggregateHorizTotalNode(
              node,
              index,
            ) as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this
              .assocPreviousYearHorizNodeFromToDates as unknown as TotalMapper,
          ),
        )(horiontalTotalNode) as unknown as IBalanceSheetTotal;
      },
    );

    /**
     * Assoc
     * @param   {IBalanceSheetCommonNode} node
     * @returns {IBalanceSheetCommonNode}
     */
    public assocPreviousYearAggregateHorizNode = (
      node: IBalanceSheetCommonNode,
    ): IBalanceSheetCommonNode => {
      const horizontalTotals = R.addIndex(R.map)(
        this.previousYearAggregateHorizNodeComposer(node),
        node.horizontalTotals,
      ) as IBalanceSheetTotal[];

      return R.assoc('horizontalTotals', horizontalTotals, node);
    };

    // ------------------------------
    // # Horizontal Nodes - Account.
    // ------------------------------
    /**
     * Retrieve the given account total in the given period.
     * @param   {number} accountId - Account id.
     * @param   {Date} fromDate - From date.
     * @param   {Date} toDate - To date.
     * @returns {number}
     */
    private getAccountPYDatePeriodTotal = R.curry(
      (accountId: number, fromDate: Date, toDate: Date): number => {
        const PYPeriodsTotal =
          this.repository.PYPeriodsAccountsLedger.whereAccountId(accountId)
            .whereToDate(toDate)
            .getClosingBalance();

        const PYPeriodsOpeningTotal =
          this.repository.PYPeriodsOpeningAccountLedger.whereAccountId(
            accountId,
          ).getClosingBalance();

        return PYPeriodsOpeningTotal + PYPeriodsTotal;
      },
    );

    /**
     * Assoc preivous year to account horizontal total node.
     * @param   {IBalanceSheetAccountNode} node
     * @returns {}
     */
    private assocPreviousYearAccountHorizTotal = R.curry(
      (node: IBalanceSheetAccountNode, totalNode) => {
        const total = this.getAccountPYDatePeriodTotal(
          node.id,
          totalNode.previousYearFromDate.date,
          totalNode.previousYearToDate.date,
        ) as unknown as number;
        return R.assoc('previousYear', this.getAmountMeta(total), totalNode);
      },
    );

    /**
     * Previous year account horizontal node composer.
     * @param   {IBalanceSheetAccountNode} node -
     * @param   {IBalanceSheetTotal}
     * @returns {IBalanceSheetTotal}
     */
    private previousYearAccountHorizNodeCompose = R.curry(
      (
        node: IBalanceSheetAccountNode,
        horizontalTotalNode: IBalanceSheetTotal,
      ): IBalanceSheetTotal => {
        type TotalMapper = (node: IBalanceSheetTotal) => IBalanceSheetTotal;

        return R.compose(
          R.when(
            this.query.isPreviousYearPercentageActive,
            this.assocPreviousYearPercentageNode as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearChangeActive,
            this.assocPreviousYearChangetNode as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this.assocPreviousYearAccountHorizTotal(
              node,
            ) as unknown as TotalMapper,
          ),
          R.when(
            this.query.isPreviousYearActive,
            this
              .assocPreviousYearHorizNodeFromToDates as unknown as TotalMapper,
          ),
        )(horizontalTotalNode) as unknown as IBalanceSheetTotal;
      },
    );

    /**
     * Assoc previous year horizontal nodes to account node.
     * @param   {IBalanceSheetAccountNode} node
     * @returns {IBalanceSheetAccountNode}
     */
    private assocPreviousYearAccountHorizNodeComposer = (
      node: IBalanceSheetAccountNode,
    ) => {
      const horizontalTotals = R.map(
        this.previousYearAccountHorizNodeCompose(node),
        node.horizontalTotals,
      );
      return R.assoc('horizontalTotals', horizontalTotals, node);
    };

    // ------------------------------
    // # Horizontal Nodes - Aggregate.
    // ------------------------------
    /**
     * Detarmines whether the given node has horizontal totals.
     * @param   {IBalanceSheetCommonNode} node
     * @returns {boolean}
     */
    public isNodeHasHorizontalTotals = (node: IBalanceSheetCommonNode) =>
      !isEmpty(node.horizontalTotals);
  };
