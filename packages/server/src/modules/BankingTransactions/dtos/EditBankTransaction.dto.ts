import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fields that can be edited on a bank transaction (the row in
 * `cashflow_transactions`) AFTER it's been created or categorized.
 *
 * Scope is deliberately narrow: only descriptive metadata. Anything
 * that affects the general-ledger posting (amount, accounts, date,
 * exchange rate) must go through uncategorize → recategorize so the
 * journal entry is reversed and re-posted correctly. This endpoint
 * exists so users can fix typos in the memo / reference / number
 * without having to void and recreate the transaction.
 */
export class EditBankTransactionDto {
  @ApiPropertyOptional({
    description: 'Free-text memo/description shown in ledger views',
    example: 'Monthly rent payment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'External reference identifier (e.g. invoice/check number)',
    example: 'REF-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string;

  @ApiPropertyOptional({
    description: 'Transaction number (human-friendly identifier)',
    example: 'TRX-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionNumber?: string;
}
