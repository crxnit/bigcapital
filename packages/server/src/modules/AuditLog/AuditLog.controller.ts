import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonHeaders } from '@/common/decorators/ApiCommonHeaders';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { RequirePermission } from '@/modules/Roles/RequirePermission.decorator';
import { AbilitySubject } from '@/modules/Roles/Roles.types';
import { AuditLogReadService } from './AuditLogRead.service';
import { SystemAuditLogQueryDto, AuditLogQueryDto } from './dtos/AuditLogQuery.dto';
import { SystemAdminGuard } from './guards/SystemAdmin.guard';

/**
 * Tenant-scoped audit log read endpoint. Requires the caller to be an
 * authenticated user in the current tenant with a role granting the
 * `read AuditLog` ability.
 *
 * Guard order matters: `AuthorizationGuard` attaches the CASL ability
 * instance to `request.ability`; `PermissionGuard` reads it. Declaring
 * both locally makes the dependency explicit so a future refactor of
 * the global guard pipeline can't silently open the route.
 */
@Controller('/audit-logs')
@ApiTags('Audit logs')
@ApiCommonHeaders()
@UseGuards(AuthorizationGuard, PermissionGuard)
export class AuditLogController {
  constructor(private readonly readService: AuditLogReadService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries for the current tenant' })
  @RequirePermission('read', AbilitySubject.AuditLog)
  async list(@Query() query: AuditLogQueryDto) {
    return this.readService.listTenant(query);
  }
}

/**
 * System-wide audit log read endpoint. Gated by SystemAdminGuard — only
 * emails listed in SYSTEM_ADMIN_EMAILS can query.
 */
@Controller('/system-audit-logs')
@ApiTags('System audit logs')
@ApiCommonHeaders()
@UseGuards(SystemAdminGuard)
export class SystemAuditLogController {
  constructor(private readonly readService: AuditLogReadService) {}

  @Get()
  @ApiOperation({ summary: 'List system-scoped audit log entries (admin only)' })
  async list(@Query() query: SystemAuditLogQueryDto) {
    return this.readService.listSystem(query);
  }
}
