import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { businessDate, computeDailyEntry, formatIstDate, formatKg, formatRupees, kgToGrams, PackEntry, rupeesToPaise } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import type { ClosingDraft } from '../lib/types';
import { colors, fontFamily, radii } from '../theme';
import { Btn, Card, Check, Cta, NumberField, Screen, Txt } from '../ui';

/** What the shop types for one product in one section (purchase or sales), as text. */
type PackForm = { loose: string; half: string; one: string; rate: string; halfPrice: string; onePrice: string };
const blank = (rate = ''): PackForm => ({ loose: '', half: '', one: '', rate, halfPrice: '', onePrice: '' });
const used = (f?: PackForm) => !!f && !!(f.loose.trim() || f.half.trim() || f.one.trim());

const num = (v: string, conv: (s: string) => number): number | null => {
  if (!v.trim()) return 0;
  try {
    const n = conv(v);
    return n < 0 ? null : n;
  } catch {
    return null;
  }
};
const count = (v: string) => (v.trim() === '' ? 0 : /^\d+$/.test(v.trim()) ? Number(v) : null);
/** Text form → shared PackEntry; null if anything is not a valid number. */
function toEntry(f: PackForm): PackEntry | null {
  const loose = num(f.loose, kgToGrams);
  const rate = num(f.rate, rupeesToPaise);
  const half = count(f.half);
  const one = count(f.one);
  const hp = f.halfPrice.trim() ? num(f.halfPrice, rupeesToPaise) : undefined;
  const op = f.onePrice.trim() ? num(f.onePrice, rupeesToPaise) : undefined;
  if ([loose, rate, half, one, hp, op].some((x) => x === null)) return null;
  return { looseGrams: loose!, halfPacks: half!, onePacks: one!, ratePaise: rate!, halfPackPricePaise: hp ?? null, onePackPricePaise: op ?? null };
}
const toPaise = (v: string) => num(v, rupeesToPaise);

export default function DailyEntry() {
  const { t, i18n } = useTranslation();
  const { snapshot, enqueue, markClosedLocally, online } = useApp();
  const [step, setStep] = useState(0);
  const [buy, setBuy] = useState<Record<string, PackForm>>({});
  const [sell, setSell] = useState<Record<string, PackForm>>({});
  const [packPrices, setPackPrices] = useState(false);
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null);

  const draft: ClosingDraft | undefined = snapshot?.draft;
  const today = businessDate();
  const lines = draft?.lines ?? [];
  // Suggested selling rate = HO's price for the day (the shop may change it).
  const defaultSell = (itemId: string) => {
    const p = lines.find((l) => l.itemId === itemId)?.pricePaisePerKg ?? 0;
    // ₹92 rather than 92.00, so the rate fits its box.
    return p ? (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2)) : '';
  };

  const entries = useMemo(() => {
    const out = lines.map((l) => ({ l, p: toEntry(buy[l.itemId] ?? blank()), s: toEntry(sell[l.itemId] ?? blank(defaultSell(l.itemId))) }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, buy, sell]);
  const valid = entries.every((e) => e.p && e.s);

  const result = useMemo(() => {
    if (!draft || !valid) return null;
    return computeDailyEntry({
      lines: entries.map((e) => ({ ...e.l, purchase: e.p!, sales: e.s! })),
      cashPaise: toPaise(cash) ?? 0,
      upiPaise: toPaise(upi) ?? 0,
      varianceTolerancePaise: draft.varianceTolerancePaise,
    });
  }, [draft, entries, valid, cash, upi]);

  if (!draft) return null;
  const alreadyClosed = draft.alreadySubmitted && draft.businessDate === today;
  if (done || alreadyClosed) {
    return (
      <Screen title={t('app.dailyEntry')} onBack={() => router.back()} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone={done === 'queued' ? 'warn' : 'accent'}>
            <Txt size={18} weight={600}>{done === 'sent' ? t('closing.submitted') : done === 'queued' ? t('closing.submittedOffline') : t('closing.already')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  const moneyOk = toPaise(cash) !== null && toPaise(upi) !== null && (cash.trim() !== '' || upi.trim() !== '');

  const submit = async () => {
    if (!result) return;
    setBusy(true);
    const capturedAt = new Date();
    const r = await enqueue({
      kind: 'closing',
      path: '/closings',
      body: {
        businessDate: businessDate(capturedAt),
        capturedAt: capturedAt.toISOString(),
        // Only products with a purchase or sale today; the server carries the rest forward.
        lines: entries.filter((e) => used(buy[e.l.itemId]) || used(sell[e.l.itemId])).map((e) => ({ itemId: e.l.itemId, purchase: e.p, sales: e.s })),
        cashPaise: toPaise(cash) ?? 0,
        upiPaise: toPaise(upi) ?? 0,
        note: note.trim(),
      },
      label: { key: 'app.queueClosing', params: { date: formatIstDate(capturedAt) } },
    });
    markClosedLocally();
    setBusy(false);
    setDone(r);
  };

  /** One product's loose + packs + rate block (purchase or sales). */
  const block = (kind: 'buy' | 'sell') => {
    const forms = kind === 'buy' ? buy : sell;
    const set = kind === 'buy' ? setBuy : setSell;
    return lines.map((l) => {
      const unit = t(`unit.${l.unit ?? 'kg'}`);
      const f = forms[l.itemId] ?? blank(kind === 'sell' ? defaultSell(l.itemId) : '');
      // Functional update: fast typing across fields must never overwrite another field's value.
      const upd = (k: keyof PackForm, v: string) =>
        set((prev) => ({ ...prev, [l.itemId]: { ...(prev[l.itemId] ?? blank(kind === 'sell' ? defaultSell(l.itemId) : '')), [k]: v } }));
      const e = toEntry(f);
      const line = result?.lines.find((x) => x.itemId === l.itemId);
      const qty = kind === 'buy' ? line?.purchaseGrams : line?.salesGrams;
      const amt = kind === 'buy' ? line?.purchasePaise : line?.salesPaise;
      const field = (k: keyof PackForm, label: string) => (
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt size={11} color={colors.textSubtle} numberOfLines={1}>{label}</Txt>
          <NumberField small value={f[k]} onChangeText={(v) => upd(k, v)} highlight={!f[k]} />
        </View>
      );
      return (
        <View key={l.itemId} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.divider, backgroundColor: used(f) ? colors.selectedRow : colors.card, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Txt size={16} weight={600}>{nameIn(l)}</Txt>
            {/* Stock before today's purchases and sales. */}
            <Txt mono size={12} color={colors.textSubtle}>{formatKg(l.openingGrams + l.receivedGrams - l.sentOutGrams + l.adjustmentGrams)} {unit}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {field('loose', `${t('closing.loose')} (${unit})`)}
            {field('half', t('closing.halfPacks', { unit }))}
            {field('one', t('closing.onePacks', { unit }))}
            {field('rate', t('closing.rate', { unit }))}
          </View>
          {packPrices && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {field('halfPrice', t('closing.halfPrice'))}
              {field('onePrice', t('closing.onePrice'))}
            </View>
          )}
          {!e && <Txt size={12} color={colors.dangerText}>{t('common.error')}</Txt>}
          {used(f) && qty != null && amt != null && (
            <Txt mono size={13} weight={600} color={colors.accent} align="right">{t('closing.lineTotal', { qty: formatKg(qty), unit, amt: formatRupees(amt, { whole: true }) })}</Txt>
          )}
        </View>
      );
    });
  };

  const v = result?.variancePaise ?? 0;
  const flagged = result?.varianceFlagged ?? false;
  const negatives = result?.negativeLines ?? [];
  const sectionHead = (title: string, sub: string) => (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.divider, gap: 4 }}>
      <Txt size={16} weight={600}>{title}</Txt>
      <Txt size={12} color={colors.textSubtle}>{sub}</Txt>
      <Pressable onPress={() => setPackPrices(!packPrices)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Check on={packPrices} />
        <Txt size={13} weight={600}>{t('closing.packPrices')}</Txt>
      </Pressable>
    </View>
  );

  return (
    <Screen
      title={step === 3 ? t('closing.reviewTitle') : t('app.dailyEntry')}
      sub={t('closing.step', { date: formatIstDate(today), n: step + 1 })}
      tone={online ? 'ink' : 'offline'}
      onBack={() => (step === 0 ? router.back() : setStep(step - 1))}
      progress={{ step, of: 4 }}
      footer={
        step === 0 ? (
          <Cta label={t('closing.nextSales')} disabled={!valid} onPress={() => setStep(1)} />
        ) : step === 1 ? (
          <Cta label={t('closing.nextMoney')} disabled={!valid} onPress={() => setStep(2)} />
        ) : step === 2 ? (
          <Cta label={t('closing.nextReview')} disabled={!moneyOk} onPress={() => setStep(3)} />
        ) : (
          <>
            <Btn label={t('common.back')} onPress={() => setStep(2)} style={{ width: 96, height: 64 }} />
            <Cta tone={flagged || negatives.length ? 'danger' : 'success'} label={t('closing.submit')} busy={busy} disabled={!result} onPress={() => void submit()} />
          </>
        )
      }
    >
      {step === 0 && (
        <View>
          {sectionHead(t('closing.purchasesTitle'), t('closing.purchasesSub'))}
          {block('buy')}
        </View>
      )}
      {step === 1 && (
        <View>
          {sectionHead(t('closing.salesTitle'), t('closing.salesSub'))}
          {block('sell')}
        </View>
      )}

      {step === 2 && (
        <View style={{ padding: 16, gap: 16 }}>
          <Txt size={17} weight={600}>{t('closing.moneyTitle')}</Txt>
          <View>
            <Txt size={15} weight={600} style={{ marginBottom: 6 }}>{t('closing.cash')}</Txt>
            <NumberField value={cash} onChangeText={setCash} unit="₹" highlight />
          </View>
          <View>
            <Txt size={15} weight={600} style={{ marginBottom: 6 }}>{t('closing.upi')}</Txt>
            <NumberField value={upi} onChangeText={setUpi} unit="₹" highlight />
          </View>
        </View>
      )}

      {step === 3 && result && (
        <View style={{ padding: 16, gap: 14 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {[
              [t('closing.purchaseTotal'), formatRupees(result.purchasePaise, { whole: true }), colors.text],
              [t('closing.salesTotal'), formatRupees(result.salesPaise, { whole: true }), colors.text],
              [t('closing.cash'), formatRupees(toPaise(cash) ?? 0, { whole: true }), colors.text],
              [t('closing.upi'), formatRupees(toPaise(upi) ?? 0, { whole: true }), colors.text],
              [t('closing.difference'), formatRupees(v, { whole: true, signed: true }), flagged ? colors.dangerText : v ? colors.warn : colors.successText],
            ].map(([k, val, c]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.dividerSoft }}>
                <Txt size={15} weight={600}>{k}</Txt>
                <Txt mono size={20} weight={600} color={c}>{val}</Txt>
              </View>
            ))}
          </Card>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Txt size={15} weight={600}>{t('closing.closingStock')}</Txt>
            </View>
            {result.lines
              .filter((l) => l.closingGrams || l.purchaseGrams || l.salesGrams)
              .map((l) => {
                const item = lines.find((x) => x.itemId === l.itemId);
                return (
                  <View key={l.itemId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.dividerFaint }}>
                    <Txt size={14}>{nameIn(item)}</Txt>
                    <Txt mono size={15} weight={600} color={l.negativeClosing ? colors.dangerText : colors.text}>
                      {formatKg(l.closingGrams)} {t(`unit.${item?.unit ?? 'kg'}`)}
                    </Txt>
                  </View>
                );
              })}
          </Card>

          {negatives.length > 0 && (
            <Card tone="danger">
              {negatives.map((l) => (
                <Txt key={l.itemId} size={15} weight={600} color={colors.dangerText}>{t('closing.negativeLine', { item: nameIn(lines.find((x) => x.itemId === l.itemId)) })}</Txt>
              ))}
              <Txt size={12} color={colors.dangerText}>{t('closing.negativeSub')}</Txt>
            </Card>
          )}

          {flagged ? (
            <Card tone="danger">
              <Txt size={18} weight={600} color={colors.dangerText}>{v < 0 ? t('closing.short', { amt: formatRupees(-v, { whole: true }) }) : t('closing.over', { amt: formatRupees(v, { whole: true }) })}</Txt>
              <Txt size={12} color={colors.dangerText}>{v < 0 ? t('closing.shortSub', { amt: formatRupees(-v, { whole: true }) }) : t('closing.overSub', { amt: formatRupees(v, { whole: true }) })}</Txt>
            </Card>
          ) : (
            <Card tone="accent">
              <Txt size={16} weight={600}>{t('closing.matched')}</Txt>
            </Card>
          )}
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t('closing.reason')}
            placeholderTextColor={colors.textFaint}
            style={{ minHeight: 64, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radii.xl, backgroundColor: colors.card, padding: 10, fontSize: 14, fontFamily: fontFamily('text', 400, i18n.language), color: colors.text, textAlignVertical: 'top' }}
          />
          <Txt size={12} color={colors.textSubtle}>{t('closing.lockNote')}</Txt>
        </View>
      )}
    </Screen>
  );
}
