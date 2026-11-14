-- Daily entry as in the HO workbook: each shop records its own purchases (qty + amount) per product.
ALTER TABLE "ClosingLine" ADD COLUMN "purchaseGrams" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClosingLine" ADD COLUMN "purchasePaise" INTEGER NOT NULL DEFAULT 0;

-- Opening stock per shop and product (quantity and cost rate), entered once when a shop starts.
CREATE TABLE "OpeningStock" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "grams" INTEGER NOT NULL,
    "ratePaise" INTEGER,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpeningStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpeningStock_shopId_itemId_key" ON "OpeningStock"("shopId", "itemId");
CREATE INDEX "OpeningStock_itemId_idx" ON "OpeningStock"("itemId");
