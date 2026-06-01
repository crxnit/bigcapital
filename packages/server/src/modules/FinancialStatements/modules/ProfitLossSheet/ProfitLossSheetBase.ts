import * as R from 'ramda';
import { TOTAL_NODE_TYPES } from './constants';
import { FinancialSheet } from '../../common/FinancialSheet';
import { GConstructor } from '@/common/types/Constructor';
import { IProfitLossSheetNode } from './ProfitLossSheet.types';

export const ProfitLossSheetBase = <T extends GConstructor<FinancialSheet>>(
  Base: T,
) =>
  class extends Base {
    // Provided at runtime by the `FinancialSheetStructure` mixin, which is also
    // composed into the concrete `ProfitLossSheet` class. Declared here (type
    // only, no runtime emit) so it is visible to this mixin's methods.
    declare findNodeDeep: (
      nodes: unknown,
      callback: (node: any) => boolean,
    ) => any;

    /**
     *
     * @param type
     * @param node
     * @returns
     */
    public isNodeType: {
      (type: string): (node: IProfitLossSheetNode) => boolean;
      (type: string, node: IProfitLossSheetNode): boolean;
    } = R.curry((type: string, node: IProfitLossSheetNode): boolean => {
      return node.nodeType === type;
    });

    /**
     *
     */
    protected isNodeTypeIn = R.curry((types: string[], node) => {
      return types.indexOf(node.nodeType) !== -1;
    });

    /**
     *
     */
    protected findNodeById = R.curry((id, nodes) => {
      return this.findNodeDeep(nodes, (node) => node.id === id);
    });

    /**
     *
     * @param node
     * @returns
     */
    isNodeTotal = (node) => {
      return this.isNodeTypeIn(TOTAL_NODE_TYPES, node);
    };
  };
