import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthGuard } from './common/auth.guard';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { smsProviderFactory } from './auth/sms.provider';
import { AccessService } from './core/access.service';
import { InsightsService } from './core/insights.service';
import { LedgerService } from './core/ledger.service';
import { PricesService } from './core/prices.service';
import { SettingsService } from './core/settings.service';
import { ShopsController } from './shops/shops.controller';
import { ItemsController } from './items/items.controller';
import { VendorsController } from './vendors/vendors.controller';
import { StorageService } from './files/storage.service';
import { DispatchesController } from './dispatches/dispatches.controller';
import { DispatchesService } from './dispatches/dispatches.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { IssuesController } from './issues/issues.controller';
import { IssuesService } from './issues/issues.service';
import { ClosingsController } from './closings/closings.controller';
import { ClosingsService } from './closings/closings.service';
import { MissingClosingJob } from './closings/missing-closing.job';
import { DashboardController } from './dashboard/dashboard.controller';
import { AdminController } from './admin/admin.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    ShopsController,
    ItemsController,
    VendorsController,
    DispatchesController,
    RequestsController,
    IssuesController,
    ClosingsController,
    DashboardController,
    AdminController,
  ],
  providers: [
    PrismaService,
    AuditService,
    AuthService,
    smsProviderFactory,
    AccessService,
    InsightsService,
    LedgerService,
    PricesService,
    SettingsService,
    StorageService,
    DispatchesService,
    RequestsService,
    IssuesService,
    ClosingsService,
    MissingClosingJob,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
