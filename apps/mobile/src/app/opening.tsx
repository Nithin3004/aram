import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { kgToGrams, rupeesToPaise } from '@aram/shared';
import { api } from '../lib/api';
import { errorText } from '../lib/flows';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Banner, Card, Cta, Notice, NumberField, Screen, Txt } from '../ui';

/**
 * Opening stock (HO workbook "Opening_Stock"): what this shop holds when it starts, with the cost
 * rate, entered once. Needs a connection (it is checked against the server so it cannot be entered twice).
 */
export default function OpeningStock() {
  const { t } = useTranslation();
  const { snapshot, online, refresh } = useApp();
  const [v, setV] = useState<Record<string, { qty: string; rate: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!snapshot) return null;
  const items = snapshot.draft.lines;

  const parse = () => {
    const lines = [];
    for (const [itemId, x] of Object.entries(v)) {
      if (!x.qty.trim() && !x.rate.trim()) continue;
      lines.push({ itemId, grams: kgToGrams(x.qty || '0'), ratePaise: x.rate.trim() ? rupeesToPaise(x.rate) : null });
    }
    return lines;
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/opening-stock', { body: { lines: parse() } });
      await refresh();
      setDone(true);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen title={t('app.openingTitle')} onBack={() => router.replace('/home')} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone="accent">
            <Txt size={18} weight={600}>{t('app.openingDone')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  let anyBad = false;
  try {
    parse();
  } catch {
    anyBad = true;
  }

  return (
    <Screen
      title={t('app.openingTitle')}
      sub={t('app.openingSub')}
      onBack={() => router.back()}
      banner={!online ? <Banner tone="warn" title={t('app.needsOnline')} /> : undefined}
      footer={<Cta tone="accent" label={t('app.openingSave')} busy={busy} disabled={!online || anyBad || !Object.values(v).some((x) => x.qty.trim())} onPress={() => void save()} />}
    >
      {error && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <Notice>{error}</Notice>
        </View>
      )}
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <Txt size={12} color={colors.textSubtle}>{t('shops.openingHint')}</Txt>
      </View>
      {items.map((i) => {
        const unit = t(`unit.${i.unit ?? 'kg'}`);
        const x = v[i.itemId] ?? { qty: '', rate: '' };
        return (
          <View key={i.itemId} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.divider, backgroundColor: colors.card, gap: 8 }}>
            <Txt size={16} weight={600}>{nameIn(i)}</Txt>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt size={11} color={colors.textSubtle}>{t('shops.qty', { unit })}</Txt>
                <NumberField value={x.qty} onChangeText={(q) => setV({ ...v, [i.itemId]: { ...x, qty: q } })} unit={unit} highlight={!x.qty} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt size={11} color={colors.textSubtle}>{t('shops.rate', { unit })}</Txt>
                <NumberField value={x.rate} onChangeText={(r) => setV({ ...v, [i.itemId]: { ...x, rate: r } })} unit="₹" />
              </View>
            </View>
          </View>
        );
      })}
    </Screen>
  );
}
