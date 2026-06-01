import { chain } from 'lodash';
import { pick } from 'lodash';
import { TInventoryTransactionDirection } from './types/InventoryCost.types';
import { ItemEntry } from '../TransactionItemEntry/models/ItemEntry';

export interface ITransformedInventoryTransaction {
  itemId?: number;
  quantity?: number | null;
  rate: number;
  transactionType: string;
  transactionId: number;
  direction: TInventoryTransactionDirection;
  date: Date | string;
  entryId?: number;
  createdAt?: Date | string;
  costAccountId?: number;
  warehouseId?: number | null;
  meta?: {
    transactionNumber?: string;
    description?: string;
  };
}

/**
 * Grpups by transaction type and id the inventory transactions.
 * @param {IInventoryTransaction} invTransactions
 * @returns
 */
export function groupInventoryTransactionsByTypeId(
  transactions: { transactionType: string; transactionId: number }[],
): { transactionType: string; transactionId: number }[][] {
  return chain(transactions)
    .groupBy((t) => `${t.transactionType}-${t.transactionId}`)
    .values()
    .value();
}

/**
 * Transforms the items entries to inventory transactions.
 */
export function transformItemEntriesToInventory(transaction: {
  transactionId: number;
  transactionType: string;
  transactionNumber?: string;

  exchangeRate?: number;

  warehouseId?: number | null;

  date: Date | string;
  direction: TInventoryTransactionDirection;
  entries: ItemEntry[];
  createdAt: Date | string;
}): ITransformedInventoryTransaction[] {
  const exchangeRate = transaction.exchangeRate || 1;

  return transaction.entries.map((entry: ItemEntry) => ({
    ...pick(entry, ['itemId', 'quantity']),
    rate: entry.rate * exchangeRate,
    transactionType: transaction.transactionType,
    transactionId: transaction.transactionId,
    direction: transaction.direction,
    date: transaction.date,
    entryId: entry.id,
    createdAt: transaction.createdAt,
    costAccountId: entry.costAccountId,

    warehouseId: entry.warehouseId || transaction.warehouseId,
    meta: {
      transactionNumber: transaction.transactionNumber,
      description: entry.description,
    },
  }));
}
