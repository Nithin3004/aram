import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { formatKg, kgToGrams } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Card, Check, Chip, Cta, Input, NumberField, Row, Screen, Txt } from '../ui';

const REASONS = ['soon', 'festival', 'other'] as const;

export default function RequestStock() {
  const { t } = useTranslation();
  const { snapshot, enqueue, online } = useApp();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('soon');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null);
  if (!snapshot) return null;

  const have = new Map(snapshot.stock.map((s) => [s.itemId, s.onHandGrams]));
  // Low items first, then everything else the shop can order.
  const items = [...snapshot.items].sort((a, b) => Number(!!snapshot.stock.find((s) => s.itemId === b.id)?.low) - Number(!!snapshot.stock.find((s) => s.itemId === a.id)?.low));
  const grams = (id: string) => {
    try {
      return kgToGrams(qty[id] || '0');
    } catch {
      return 0;
    }
  };
  const lines = picked.map((id) => ({ itemId: id, grams: grams(id) })).filter((l) => l.grams > 0);
  const reasonText = reason === 'other' ? other.trim() : t(`requestForm.reasons.${reason}`);
  const valid = lines.length > 0 && lines.length === picked.length && !!reasonText;

  const send = async () => {
    setBusy(true);
    const r = await enqueue({ kind: 'request', path: '/requests', body: { lines, reason: reasonText }, label: { key: 'app.queueRequest', params: { n: lines.length } } });
    setBusy(false);
    setDone(r);
  };

  if (done) {
    return (
      <Screen title={t('requestForm.title')} onBack={() => router.back()} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone={done === 'sent' ? 'accent' : 'warn'}>
            <Txt size={18} weight={600}>{done === 'sent' ? t('requestForm.sent') : t('requestForm.queued')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('requestForm.title')}
      sub={t('requestForm.sub')}
      tone={online ? 'ink' : 'offline'}
      onBack={() => router.back()}
      footer={<Cta tone="accent" label={t('requestForm.send')} sub={t('requestForm.sendSub', { n: lines.length })} disabled={!valid} busy={busy} onPress={() => void send()} />}
    >
      {items.map((it) => {
        const on = picked.includes(it.id);
        return (
          <Row key={it.id} tone={on ? 'accent' : undefined} onPress={() => setPicked(on ? picked.filter((x) => x !== it.id) : [...picked, it.id])}>
            <Check on={on} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt size={16} weight={600}>{nameIn(it)}</Txt>
              <Txt size={11} color={colors.textSubtle}>{t('requestForm.have', { kg: formatKg(have.get(it.id) ?? 0) })}</Txt>
            </View>
            {on && (
              <Pressable onPress={(e) => e.stopPropagation?.()}>
                <NumberField width={104} value={qty[it.id] ?? ''} onChangeText={(v) => setQty({ ...qty, [it.id]: v })} unit={t('common.kg')} highlight autoFocus />
              </Pressable>
            )}
          </Row>
        );
      })}
      <View style={{ padding: 16, gap: 10 }}>
        <Txt size={15} weight={600}>{t('requestForm.reason')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REASONS.map((r) => (
            <Chip key={r} label={t(`requestForm.reasons.${r}`)} on={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        {reason === 'other' && <Input value={other} onChangeText={setOther} placeholder={t('requestForm.otherReason')} />}
      </View>
    </Screen>
  );
}
