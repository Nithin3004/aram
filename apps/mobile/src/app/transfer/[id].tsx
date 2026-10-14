import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { formatKg, kgToGrams } from '@aram/shared';
import { confirmSent, errorText } from '../../lib/flows';
import { nameIn } from '../../lib/i18n';
import { useApp } from '../../lib/store';
import { colors } from '../../theme';
import { Banner, Card, Cta, Notice, Row, Screen, Stepper, Txt } from '../../ui';

/** Supervisor confirms what it actually sent on an HO-ordered transfer (it cannot refuse). */
export default function ConfirmTransfer() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, online, refresh } = useApp();
  const d = snapshot?.outgoing.find((x) => x.id === id);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries((d?.lines ?? []).map((l) => [l.itemId, formatKg(l.orderedGrams ?? 0).replace(/,/g, '')])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!d) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmSent(d.id, d.lines.map((l) => ({ itemId: l.itemId, sentGrams: kgToGrams(qty[l.itemId] || '0') })));
      await refresh();
      router.replace('/home');
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('app.confirmSent')}
      sub={`${d.ref} → ${d.dest.code} ${nameIn(d.dest)}`}
      tone="supervisor"
      onBack={() => router.back()}
      banner={!online ? <Banner tone="warn" title={t('app.needsOnline')} /> : undefined}
      footer={<Cta tone="resolved" label={t('app.confirmSentBtn')} busy={busy} disabled={!online} onPress={() => void send()} />}
    >
      {error && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <Notice>{error}</Notice>
        </View>
      )}
      {d.deliveryCode && (
        <View style={{ padding: 16 }}>
          <Card tone="resolved">
            <Txt mono size={11} color={colors.resolved}>{t('dispatch.slipCode')}</Txt>
            <Txt mono size={28} weight={600} color={colors.resolved} style={{ letterSpacing: 6 }}>{d.deliveryCode}</Txt>
            <Txt size={12} color={colors.resolved}>{t('dispatch.slipScan')}</Txt>
          </Card>
        </View>
      )}
      {d.lines.map((l) => (
        <Row key={l.itemId} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={17} weight={600}>{nameIn(l)}</Txt>
            <Txt mono size={14} color={colors.textSubtle}>{t('dispatch.ordered')} {formatKg(l.orderedGrams ?? 0)}</Txt>
          </View>
          <Stepper value={qty[l.itemId] ?? ''} onChange={(v) => setQty({ ...qty, [l.itemId]: v })} step={5} unit={t('common.kg')} />
        </Row>
      ))}
    </Screen>
  );
}
