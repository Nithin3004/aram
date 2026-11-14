/* eslint-disable no-console */
/**
 * Fills in Tamil names that are still empty (never overwrites one HO has typed):
 *   shops "Shop 001" → "கடை 001", supervisors "Supervisor 1" → "மேற்பார்வையாளர் 1",
 *   the standard products by name. Safe to run on every deploy.
 */
import '../src/env';
import { PrismaClient } from '@prisma/client';

const PRODUCTS: Record<string, string> = {
  'chana dal': 'கடலைப் பருப்பு',
  'toor dal': 'துவரம் பருப்பு',
  'moong dal': 'பாசிப் பருப்பு',
  'urad dal': 'உளுத்தம் பருப்பு',
  sugar: 'சர்க்கரை',
  oil: 'எண்ணெய்',
};

export function tamilFor(nameEn: string): string | null {
  const shop = nameEn.match(/^shop\s*(\d+)$/i);
  if (shop) return `கடை ${shop[1]}`;
  const sup = nameEn.match(/^supervisor\s*(\d+)$/i);
  if (sup) return `மேற்பார்வையாளர் ${sup[1]}`;
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    let shops = 0;
    for (const s of await prisma.shop.findMany({ where: { nameTa: '' } })) {
      const ta = tamilFor(s.nameEn);
      if (ta) {
        await prisma.shop.update({ where: { id: s.id }, data: { nameTa: ta } });
        shops++;
      }
    }
    let items = 0;
    for (const i of await prisma.item.findMany({ where: { nameTa: '' } })) {
      const ta = PRODUCTS[i.nameEn.trim().toLowerCase()];
      if (ta) {
        await prisma.item.update({ where: { id: i.id }, data: { nameTa: ta } });
        items++;
      }
    }
    if (shops || items) {
      await prisma.auditLog.create({
        data: { actorName: 'System', action: 'TAMIL_NAMES', entityType: 'System', entityId: 'backfill', summary: `Filled Tamil names for ${shops} shops and ${items} products` },
      });
    }
    console.log(`Tamil names filled: ${shops} shops, ${items} products.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
