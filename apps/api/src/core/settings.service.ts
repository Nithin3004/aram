import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface Settings {
  varianceTolerancePaise: number;
  lowStockDays: number;
  closingDueTime: string;
  requestFrequencyPerWeek: number;
}

export const DEFAULT_SETTINGS: Settings = {
  varianceTolerancePaise: 10000, // ₹100
  lowStockDays: 2,
  closingDueTime: '21:00',
  requestFrequencyPerWeek: 3,
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(): Promise<Settings> {
    const rows = await this.prisma.setting.findMany();
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key in DEFAULT_SETTINGS) {
        out[r.key] = typeof DEFAULT_SETTINGS[r.key as keyof Settings] === 'number' ? Number(r.value) : r.value;
      }
    }
    return out as unknown as Settings;
  }

  async set(patch: Partial<Settings>) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      await this.prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
    }
    return this.get();
  }
}
