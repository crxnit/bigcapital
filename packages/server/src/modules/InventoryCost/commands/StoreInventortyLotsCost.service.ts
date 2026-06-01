import { Knex } from 'knex';
import { Inject, Injectable } from '@nestjs/common';
import { omit } from 'lodash';
import { InventoryCostLotTracker } from '../models/InventoryCostLotTracker';
import { TenantModelProxy } from '../../System/models/TenantBaseModel';

@Injectable()
export class StoreInventoryLotsCostService {
  constructor(
    @Inject(InventoryCostLotTracker.name)
    private readonly inventoryCostLotTracker: TenantModelProxy<
      typeof InventoryCostLotTracker
    >,
  ) {}

  /**
   * Stores the inventory lots costs transactions in bulk.
   * @param {InventoryCostLotTracker[]} costLotsTransactions - Inventory lots costs transactions.
   * @param {Knex.Transaction} trx - Knex transaction.
   * @return {Promise<object>}
   */
  public async storeInventoryLotsCost(
    costLotsTransactions: InventoryCostLotTracker[],
    trx?: Knex.Transaction,
  ): Promise<void> {
    // Run sequentially — `trx` is not concurrency-safe; parallel inserts /
    // decrements on a single Knex transaction give non-deterministic failures.
    for (const transaction of costLotsTransactions as any[]) {
      if (transaction.lotTransId && transaction.decrement) {
        await this.inventoryCostLotTracker()
          .query(trx)
          .where('id', transaction.lotTransId)
          .decrement('remaining', transaction.decrement);
      } else if (!transaction.lotTransId) {
        await this.inventoryCostLotTracker()
          .query(trx)
          .insert({
            ...omit(transaction, ['decrement', 'invTransId', 'lotTransId']),
          });
      }
    }
  }

  /**
   * Reverts the inventory lots `OUT` transactions.
   * @param {Date} startingDate - Starting date.
   * @param {number} itemId - Item id.
   * @param {Knex.Transaction} trx - Knex transaction.
   * @returns {Promise<void>}
   */
  async revertInventoryCostLotTransactions(
    startingDate: Date,
    itemId: number,
    trx?: Knex.Transaction,
  ): Promise<void> {
    await this.inventoryCostLotTracker()
      .query(trx)
      .modify('filterDateRange', startingDate)
      .orderBy('date', 'DESC')
      .where('item_id', itemId)
      .delete();
  }
}
