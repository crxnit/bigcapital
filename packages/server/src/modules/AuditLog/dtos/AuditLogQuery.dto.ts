import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query shape for the tenant and system audit-log read endpoints. Kept
 * deliberately narrow — support has free-text filtering later if needed,
 * but v1 exposes only the indexed columns so we don't accidentally build
 * a slow unfiltered table scan.
 */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by audit action string', example: 'auth.login.failed' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user ID', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  userId?: number;

  @ApiPropertyOptional({ description: 'Filter by resource model name', example: 'ApiKey' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by resource ID (stringified)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Only include rows with created_at >= this ISO-8601 timestamp',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Only include rows with created_at < this ISO-8601 timestamp',
    example: '2026-02-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: '1-indexed page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size (max 100)', example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}

/**
 * System-scoped audit route supports an additional tenant-ID filter so
 * admins can scope a query to one tenant's system events (login, invite
 * accept, etc). Extends the same pagination/filter surface.
 */
export class SystemAuditLogQueryDto extends AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tenantId?: number;
}
