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
  IsString,
  ValidateNested,
} from 'class-validator';
import { ToNumber } from '@/common/decorators/Validators';
import { ItemEntryDto } from '@/modules/TransactionItemEntry/dto/ItemEntry.dto';

enum DiscountType {
  Percentage = 'percentage',
  Amount = 'amount',
}

export class VendorCreditEntryDto extends ItemEntryDto {}

/**
 * A direct-account allocation row on a vendor credit (Description + Account +
 * Amount). Mirrors BillExpenseCategoryDto. Trimmed for v1: no percent/
 * amount_type, no landed-cost flag.
 */
export class VendorCreditExpenseCategoryDto {
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
    description: 'Expense account the allocation credits',
    example: 5000,
  })
  expenseAccountId: number;

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

export class CommandVendorCreditDto {
  @ToNumber()
  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The id of the vendor',
    example: 1,
  })
  vendorId: number;

  @ToNumber()
  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The exchange rate of the vendor credit',
    example: 1,
  })
  exchangeRate?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'The vendor credit number', example: '123456' })
  vendorCreditNumber?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The reference number of the vendor credit',
    example: '123456',
  })
  referenceNo?: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The date of the vendor credit',
    example: '2021-01-01',
  })
  vendorCreditDate: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The note of the vendor credit',
    example: '123456',
  })
  note?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'The open status of the vendor credit',
    example: true,
  })
  open: boolean = false;

  @ToNumber()
  @IsInt()
  @IsOptional()
  @ApiProperty({
    description: 'The warehouse id of the vendor credit',
    example: 1,
  })
  warehouseId?: number;

  @ToNumber()
  @IsInt()
  @IsOptional()
  @ApiProperty({
    description: 'The branch id of the vendor credit',
    example: 1,
  })
  branchId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorCreditEntryDto)
  @ApiProperty({
    description:
      'The entries of the vendor credit. Either entries or categories must be non-empty; both may be set.',
    example: [
      {
        itemId: 1,
        quantity: 1,
        unitPrice: 1,
        discount: 1,
        discountType: DiscountType.Percentage,
        accountId: 1,
        amount: 1,
      },
    ],
  })
  entries?: VendorCreditEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorCreditExpenseCategoryDto)
  @ApiProperty({
    description:
      'Direct-account allocations (Description + Account + Amount). Either entries or categories must be non-empty; both may be set.',
    type: () => VendorCreditExpenseCategoryDto,
    isArray: true,
    required: false,
  })
  categories?: VendorCreditExpenseCategoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  @IsOptional()
  @ApiProperty({
    description: 'The attachments of the vendor credit',
    example: [{ key: '123456' }],
  })
  attachments?: AttachmentDto[];

  @ToNumber()
  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The discount of the vendor credit',
    example: 1,
  })
  discount?: number;

  @IsEnum(DiscountType)
  @IsOptional()
  @ApiProperty({
    description: 'The discount type of the vendor credit',
    example: DiscountType.Percentage,
  })
  discountType?: DiscountType;

  @ToNumber()
  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The adjustment of the vendor credit',
    example: 1,
  })
  adjustment?: number;
}

export class CreateVendorCreditDto extends CommandVendorCreditDto {}
export class EditVendorCreditDto extends CommandVendorCreditDto {}
