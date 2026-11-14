-- Products can be sold by kg or by litre (oil). Integer grams / millilitres either way.
ALTER TABLE "Item" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'kg';
-- Cost per unit used for profit before any purchase is recorded (average opening rate).
ALTER TABLE "Item" ADD COLUMN "baseCostPaisePerKg" INTEGER;
