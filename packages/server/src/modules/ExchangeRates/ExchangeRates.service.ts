import { Injectable } from '@nestjs/common';
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

    // Graceful degrade: when no external exchange-rate provider is configured
    // (`OPEN_EXCHANGE_RATE_APP_ID` blank), skip the upstream call and return a
    // no-op rate so the form falls back to manual entry without erroring.
    if (!process.env.OPEN_EXCHANGE_RATE_APP_ID) {
      return {
        baseCurrency: fromCurrency,
        toCurrency: exchangeRateLatestDTO.toCurrency || toCurrency,
        exchangeRate: 1,
      };
    }

    const exchange = new ExchangeRate(ExchangeRateServiceType.OpenExchangeRate);
    const exchangeRate = await exchange.latest(fromCurrency, toCurrency);

    return {
      baseCurrency: fromCurrency,
      toCurrency: exchangeRateLatestDTO.toCurrency || toCurrency,
      exchangeRate,
    };
  }
}
