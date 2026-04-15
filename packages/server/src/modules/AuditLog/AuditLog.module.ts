import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RegisterTenancyModel } from '../Tenancy/TenancyModels/Tenancy.module';
import { InjectSystemModel } from '../System/SystemModels/SystemModels.module';
import { AuditLog } from './models/AuditLog.model';
import { SystemAuditLog } from './models/SystemAuditLog.model';
import { AuditLogService } from './AuditLog.service';
import { AuditLogReadService } from './AuditLogRead.service';
import { AUDIT_LOG_BATCH_QUEUE } from './AuditLog.constants';
import { AuditLogBatchBuffer } from './AuditLogBatchBuffer.service';
import { AuditLogBatchProcessor } from './AuditLogBatchProcessor';
import {
  AuditLogController,
  SystemAuditLogController,
} from './AuditLog.controller';
import { SystemAdminGuard } from './guards/SystemAdmin.guard';

// Subscribers (PR 4.2 + 4.3)
import { AuthAuditSubscriber } from './subscribers/AuthAudit.subscriber';
import { UserAuditSubscriber } from './subscribers/UserAudit.subscriber';
import { PaymentAuditSubscriber } from './subscribers/PaymentAudit.subscriber';
import { PlaidAuditSubscriber } from './subscribers/PlaidAudit.subscriber';
import { ApiKeyAuditSubscriber } from './subscribers/ApiKeyAudit.subscriber';

// Retention crons (PR 4.5)
import { AuditLogCleanupJob } from './jobs/AuditLogCleanup.job';
import { SystemAuditLogCleanupJob } from './jobs/SystemAuditLogCleanup.job';

const tenantModels = [RegisterTenancyModel(AuditLog)];
const systemModels = [InjectSystemModel(SystemAuditLog)];

@Global()
@Module({
  imports: [
    ConfigModule,
    ...tenantModels,
    BullModule.registerQueue({ name: AUDIT_LOG_BATCH_QUEUE }),
    BullBoardModule.forFeature({
      name: AUDIT_LOG_BATCH_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AuditLogController, SystemAuditLogController],
  providers: [
    ...systemModels,
    AuditLogService,
    AuditLogReadService,
    AuditLogBatchBuffer,
    AuditLogBatchProcessor,
    SystemAdminGuard,
    AuthAuditSubscriber,
    UserAuditSubscriber,
    PaymentAuditSubscriber,
    PlaidAuditSubscriber,
    ApiKeyAuditSubscriber,
    AuditLogCleanupJob,
    SystemAuditLogCleanupJob,
  ],
  exports: [AuditLogService, ...tenantModels, ...systemModels],
})
export class AuditLogModule {}
