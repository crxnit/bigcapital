import { IsOptional, ToNumber } from '@/common/decorators/Validators';
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
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

enum DiscountType {
  Percentage = 'percentage',
  Amount = 'amount',
}

/**
 * A direct-account allocation row on an invoice (Description + Account +
 * Amount). Mirrors BillExpenseCategoryDto but credits an income account
 * instead of debiting an expense account.
 */
export class SaleInvoiceIncomeCategoryDto {
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
    description: 'Income account the allocation credits',
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

export class PaymentMethodDto {
  @ApiProperty({
    description: 'The ID of the payment integration',
    example: 1,
  })
  @IsInt()
  paymentIntegrationId: number;

  @ApiProperty({
    description: 'Whether the payment method is enabled',
    example: true,
  })
  @IsBoolean()
  enable: boolean;
}

class AttachmentDto {
  @IsString()
  key: string;
}

class CommandSaleInvoiceDto {
  @ToNumber()
  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ description: 'Customer ID', example: 1 })
  customerId: number;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Invoice date', example: '2023-01-01T00:00:00Z' })
  invoiceDate: Date;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Due date', example: '2023-01-15T00:00:00Z' })
  dueDate: Date;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Invoice number',
    required: false,
    example: 'INV-001',
  })
  invoiceNo?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Reference number',
    required: false,
    example: 'REF-001',
  })
  referenceNo?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the invoice is delivered',
    default: false,
    required: false,
  })
  delivered: boolean = false;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Invoice message',
    required: false,
    example: 'Thank you for your business',
  })
  invoiceMessage?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Terms and conditions',
    required: false,
    example: 'Payment due within 14 days',
  })
  termsConditions?: string;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @Min(0)
  @ApiProperty({
    description: 'Exchange rate',
    required: false,
    minimum: 0,
    example: 1.0,
  })
  exchangeRate?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ description: 'Warehouse ID', required: false, example: 1 })
  warehouseId?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ description: 'Branch ID', required: false, example: 1 })
  branchId?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ description: 'Project ID', required: false, example: 1 })
  projectId?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether tax is inclusive',
    required: false,
    example: false,
  })
  isInclusiveTax?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemEntryDto)
  @ApiProperty({
    description: 'Invoice line items',
    type: [ItemEntryDto],
    required: false,
  })
  entries?: ItemEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleInvoiceIncomeCategoryDto)
  @ApiProperty({
    description:
      'Direct-account income allocations (Description + Account + Amount). Either entries or categories must be non-empty; both may be set.',
    type: () => SaleInvoiceIncomeCategoryDto,
    isArray: true,
    required: false,
  })
  categories?: SaleInvoiceIncomeCategoryDto[];

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({ description: 'PDF template ID', required: false, example: 1 })
  pdfTemplateId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodDto)
  @ApiProperty({
    description: 'Payment methods',
    type: [PaymentMethodDto],
    required: false,
  })
  paymentMethods?: PaymentMethodDto[];

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @ApiProperty({ description: 'Discount value', required: false, example: 10 })
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  @ApiProperty({
    description: 'Discount type',
    enum: DiscountType,
    required: false,
    example: DiscountType.Percentage,
  })
  discountType?: DiscountType;

  @IsOptional()
  @ToNumber()
  @IsNumber()
  @ApiProperty({
    description: 'Adjustment amount',
    required: false,
    example: 5,
  })
  adjustment?: number;

  @IsOptional()
  @ToNumber()
  @IsInt()
  @ApiProperty({
    description: 'ID of the estimate this invoice is created from',
    required: false,
    example: 1,
  })
  fromEstimateId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  @ApiProperty({
    description: 'The attachments of the sale receipt',
    example: [{ key: '123456' }],
  })
  attachments?: AttachmentDto[];
}

export class CreateSaleInvoiceDto extends CommandSaleInvoiceDto {}
export class EditSaleInvoiceDto extends CommandSaleInvoiceDto {}
