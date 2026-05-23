import { ToNumber } from '@/common/decorators/Validators';
import { ItemEntryDto } from '@/modules/TransactionItemEntry/dto/ItemEntry.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

enum DiscountType {
  Percentage = 'percentage',
  Amount = 'amount',
}

export class CreditNoteEntryDto extends ItemEntryDto {}

/**
 * A direct-account allocation row on a credit note (Description + Account
 * + Amount). Mirrors SaleInvoiceIncomeCategoryDto on the AR-credit side:
 * one DR per row against the chosen income account (reversing what the
 * original sale invoice CR'd to income).
 */
export class CreditNoteIncomeCategoryDto {
  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({
    description:
      'The id of an existing category row. Preserve on edit so upsertGraph updates in place instead of delete+reinsert.',
    required: false,
  })
  id?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ description: 'Display order index of the row', example: 1 })
  index?: number;

  @IsNotEmpty()
  @ToNumber()
  @IsInt()
  @ApiProperty({
    description: 'Income account the allocation debits',
    example: 4000,
  })
  incomeAccountId: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Row description', required: false })
  description?: string;

  @IsNotEmpty()
  @ToNumber()
  @IsNumber()
  @ApiProperty({ description: 'Allocation amount (pre-tax)', example: 100 })
  amount: number;
}

class AttachmentDto {
  @IsString()
  @IsNotEmpty()
  key: string;
}

export class CommandCreditNoteDto {
  @ToNumber()
  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'The customer ID' })
  customerId: number;

  @IsOptional()
  @ToNumber()
  @IsPositive()
  @ApiProperty({ example: 3.43, description: 'The exchange rate' })
  exchangeRate?: number;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty({ example: '2021-09-01', description: 'The credit note date' })
  creditNoteDate: Date;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123', description: 'The reference number' })
  referenceNo?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123', description: 'The credit note number' })
  creditNoteNumber?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123', description: 'The note' })
  note?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123', description: 'The terms and conditions' })
  termsConditions?: string;

  @IsBoolean()
  @ApiProperty({ example: false, description: 'The credit note is open' })
  open: boolean = false;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ example: 1, description: 'The warehouse ID' })
  warehouseId?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ example: 1, description: 'The branch ID' })
  branchId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteEntryDto)
  @ApiProperty({
    example: [{ itemId: 1, quantity: 1, rate: 10, taxRateId: 1 }],
    description: 'The credit note entries',
    required: false,
  })
  entries?: CreditNoteEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteIncomeCategoryDto)
  @ApiProperty({
    description:
      'Direct-account income allocations (Description + Account + Amount). Either entries or categories must be non-empty; both may be set.',
    type: () => CreditNoteIncomeCategoryDto,
    isArray: true,
    required: false,
  })
  categories?: CreditNoteIncomeCategoryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ example: 1, description: 'The pdf template ID' })
  pdfTemplateId?: number;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @ApiProperty({ example: 10, description: 'The discount amount' })
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  @ApiProperty({
    example: 'percentage',
    description: 'The discount type',
    enum: DiscountType,
  })
  discountType?: DiscountType;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  adjustment?: number;
}

export class CreateCreditNoteDto extends CommandCreditNoteDto {}
export class EditCreditNoteDto extends CommandCreditNoteDto {}
