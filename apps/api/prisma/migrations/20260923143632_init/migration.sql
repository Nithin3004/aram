-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SHOP');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('HO', 'SUPERVISOR', 'SMALL');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('CREATED', 'DISPATCHED', 'RECEIVED', 'MATCHED', 'DISCREPANCY', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DispatchKind" AS ENUM ('DISPATCH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('AUTO', 'SHOP');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('DISPATCH_DISCREPANCY', 'CASH_VARIANCE', 'NEGATIVE_SOLD', 'MISSING_CLOSING', 'DAMAGED_GOODS', 'TRANSFER_PROBLEM', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('PURCHASE', 'DISPATCH_OUT', 'RECEIVE_IN', 'SOLD', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "shopId" TEXT,
    "permissions" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "trustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTa" TEXT NOT NULL,
    "type" "ShopType" NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTa" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPrice" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "pricePaisePerKg" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTa" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "supplies" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyGrams" INTEGER NOT NULL,
    "costPaisePerKg" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" BIGSERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtyGrams" INTEGER NOT NULL,
    "type" "LedgerType" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "DispatchKind" NOT NULL,
    "sourceShopId" TEXT NOT NULL,
    "destShopId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'CREATED',
    "deliveryCode" TEXT NOT NULL,
    "codeUsedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "photoKey" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchLine" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderedGrams" INTEGER NOT NULL,
    "sentGrams" INTEGER,
    "receivedGrams" INTEGER,

    CONSTRAINT "DispatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeAttempt" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvalType" "ApprovalType",
    "reason" TEXT NOT NULL,
    "rejectReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requestedGrams" INTEGER NOT NULL,
    "approvedGrams" INTEGER,

    CONSTRAINT "RequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "source" "IssueSource" NOT NULL,
    "type" "IssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "dispatchId" TEXT,
    "closingId" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recountRequestedAt" TIMESTAMP(3),
    "recountRequestedBy" TEXT,
    "recount" JSONB,
    "recountAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClosing" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "cashPaise" INTEGER NOT NULL,
    "upiPaise" INTEGER NOT NULL,
    "expectedRevenuePaise" INTEGER NOT NULL,
    "variancePaise" INTEGER NOT NULL,
    "varianceFlagged" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosingLine" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "openingGrams" INTEGER NOT NULL,
    "receivedGrams" INTEGER NOT NULL,
    "sentOutGrams" INTEGER NOT NULL,
    "adjustmentGrams" INTEGER NOT NULL,
    "closingGrams" INTEGER NOT NULL,
    "soldGrams" INTEGER NOT NULL,
    "pricePaisePerKg" INTEGER NOT NULL,
    "expectedPaise" INTEGER NOT NULL,

    CONSTRAINT "ClosingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_deviceId_key" ON "Device"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_code_key" ON "Shop"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE INDEX "ItemPrice_itemId_effectiveFrom_idx" ON "ItemPrice"("itemId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ItemPrice_itemId_effectiveFrom_key" ON "ItemPrice"("itemId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "StockLedger_shopId_itemId_effectiveAt_idx" ON "StockLedger"("shopId", "itemId", "effectiveAt");

-- CreateIndex
CREATE INDEX "StockLedger_shopId_type_effectiveAt_idx" ON "StockLedger"("shopId", "type", "effectiveAt");

-- CreateIndex
CREATE INDEX "StockLedger_refType_refId_idx" ON "StockLedger"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_number_key" ON "Dispatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_requestId_key" ON "Dispatch"("requestId");

-- CreateIndex
CREATE INDEX "Dispatch_destShopId_status_idx" ON "Dispatch"("destShopId", "status");

-- CreateIndex
CREATE INDEX "Dispatch_sourceShopId_status_idx" ON "Dispatch"("sourceShopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchLine_dispatchId_itemId_key" ON "DispatchLine"("dispatchId", "itemId");

-- CreateIndex
CREATE INDEX "CodeAttempt_shopId_createdAt_idx" ON "CodeAttempt"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_number_key" ON "StockRequest"("number");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_clientId_key" ON "StockRequest"("clientId");

-- CreateIndex
CREATE INDEX "StockRequest_shopId_createdAt_idx" ON "StockRequest"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "StockRequest_status_idx" ON "StockRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RequestLine_requestId_itemId_key" ON "RequestLine"("requestId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_number_key" ON "Issue"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_clientId_key" ON "Issue"("clientId");

-- CreateIndex
CREATE INDEX "Issue_status_createdAt_idx" ON "Issue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Issue_shopId_idx" ON "Issue"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosing_clientId_key" ON "DailyClosing"("clientId");

-- CreateIndex
CREATE INDEX "DailyClosing_businessDate_idx" ON "DailyClosing"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosing_shopId_businessDate_key" ON "DailyClosing"("shopId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingLine_closingId_itemId_key" ON "ClosingLine"("closingId", "itemId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchLine" ADD CONSTRAINT "DispatchLine_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StockRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingLine" ADD CONSTRAINT "ClosingLine_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "DailyClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
