import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { TENANCY_DB_CONNECTION } from '../Tenancy/TenancyDB/TenancyDB.constants';
import { DeleteCustomer } from './commands/DeleteCustomer.service';
import { ModelHasRelationsError } from '@/common/exceptions/ModelHasRelations.exception';
import { ServiceError } from '@/modules/Items/ServiceError';

@Injectable()
export class ValidateBulkDeleteCustomersService {
  constructor(
    private readonly deleteCustomerService: DeleteCustomer,
    @Inject(TENANCY_DB_CONNECTION)
    private readonly tenantKnex: () => Knex,
  ) {}

  public async validateBulkDeleteCustomers(customerIds: number[]): Promise<{
    deletableCount: number;
    nonDeletableCount: number;
    deletableIds: number[];
    nonDeletableIds: number[];
  }> {
    const trx = await this.tenantKnex().transaction({
      isolationLevel: 'read uncommitted',
    });

    try {
      const deletableIds: number[] = [];
      const nonDeletableIds: number[] = [];

      for (const customerId of customerIds) {
        try {
          await this.deleteCustomerService.deleteCustomer(customerId, trx);
          deletableIds.push(customerId);
        } catch (error) {
          const isExpected =
            error instanceof ModelHasRelationsError ||
            (error instanceof ServiceError &&
              error.errorType === 'CUSTOMER_HAS_TRANSACTIONS');
          if (!isExpected) {
            // Unexpected error during the delete probe — still classify as
            // non-deletable so the bulk check doesn't 500, but log it so real
            // failures (DB/constraint/subscriber errors) aren't masked.
            // eslint-disable-next-line no-console
            console.error(
              '[ValidateBulkDeleteCustomers] unexpected error',
              customerId,
              error,
            );
          }
          nonDeletableIds.push(customerId);
        }
      }

      await trx.rollback();

      return {
        deletableCount: deletableIds.length,
        nonDeletableCount: nonDeletableIds.length,
        deletableIds,
        nonDeletableIds,
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}
