import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ExchangeRate } from './lib/ExchangeRate';
import { ExchangeRateServiceType } from './lib/types';
import { TenantMetadata } from '@/modules/System/models/TenantMetadataModel';
import { ServiceError } from '@/modules/Items/ServiceError';
import {
  ExchangeRateLatestDTO,
  EchangeRateLatestPOJO,
} from './ExchangeRates.types';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(private readonly clsService: ClsService) {}

  /**
   * Gets the latest exchange rate.
   * @param {ExchangeRateLatestDTO} exchangeRateLatestDTO
   * @returns {EchangeRateLatestPOJO}
   */
  public async latest(
    exchangeRateLatestDTO: ExchangeRateLatestDTO,
  ): Promise<EchangeRateLatestPOJO> {
    // Tenant context lives in CLS (set per-request by `verifyPayload` in the
    // JWT strategy) — read it here rather than from the request object.
    const tenantId = this.clsService.get('tenantId');
    const organization = await TenantMetadata.query().findOne({ tenantId });

    if (!organization) {
      throw new ServiceError(
        'ORGANIZATION_NOT_FOUND',
        'Organization metadata could not be resolved for the current tenant.',
      );
    }

    // Assign the organization base currency as a default currency
    // if no currency is provided.
    const fromCurrency =
      exchangeRateLatestDTO.fromCurrency || organization.baseCurrency;
    const toCurrency =
      exchangeRateLatestDTO.toCurrency || organization.baseCurrency;

    const resolvedToCurrency = exchangeRateLatestDTO.toCurrency || toCurrency;

    // Auto-rate is best-effort. Skip the upstream call entirely when no provider
    // is configured (`OPEN_EXCHANGE_RATE_APP_ID` blank); otherwise attempt it but
    // degrade to a no-op rate on ANY provider failure (invalid/rejected key,
    // base-currency not allowed on the plan, network error). Either way the form
    // falls back to manual rate entry instead of surfacing a console error.
    if (!process.env.OPEN_EXCHANGE_RATE_APP_ID) {
      return {
        baseCurrency: fromCurrency,
        toCurrency: resolvedToCurrency,
        exchangeRate: 1,
      };
    }

    try {
      const exchange = new ExchangeRate(
        ExchangeRateServiceType.OpenExchangeRate,
      );
      const exchangeRate = await exchange.latest(fromCurrency, toCurrency);

      return {
        baseCurrency: fromCurrency,
        toCurrency: resolvedToCurrency,
        exchangeRate,
      };
    } catch (error) {
      this.logger.warn(
        `Exchange-rate provider unavailable (${fromCurrency}->${toCurrency}); ` +
          `falling back to rate 1. ${error?.message ?? error}`,
      );
      return {
        baseCurrency: fromCurrency,
        toCurrency: resolvedToCurrency,
        exchangeRate: 1,
      };
    }
  }
}
