import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import { businessDate, computeClosing, formatIstDate, formatKg, formatRupees, kgToGrams, rupeesToPaise } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors, fontFamily, radii } from '../theme';
import { Btn, Card, Cta, NumberField, Row, Screen, Txt } from '../ui';

const toGrams = (v: string) => {
  try {
    return v.trim() === '' ? null : kgToGrams(v);
  } catch {
    return null;
  }
};
const toPaise = (v: string) => {
  try {
    return v.trim() === '' ? null : rupeesToPaise(v);
  } catch {
    return null;
  }
};

export default function Closing() {
  const { t, i18n } = useTranslation();
  const { snapshot, enqueue, markClosedLocally, online } = useApp();
  const [step, setStep] = useState(0);
  const [left, setLeft] = useState<Record<string, string>>({});
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null);

  const draft = snapshot?.draft;
  const today = businessDate();
  const lines = draft?.lines ?? [];

  const result = useMemo(() => {
    if (!draft) return null;
    const counted = lines.map((l) => ({ ...l, closingGrams: toGrams(left[l.itemId] ?? '') }));
    if (counted.some((l) => l.closingGrams === null || l.closingGrams < 0)) return null;
    const c = toPaise(cash) ?? 0;
    const u = toPaise(upi) ?? 0;
    return computeClosing({
      lines: counted.map((l) => ({ ...l, closingGrams: l.closingGrams! })),
      cashPaise: c,
      upiPaise: u,
      varianceTolerancePaise: draft.varianceTolerancePaise,
    });
  }, [draft, lines, left, cash, upi]);

  if (!draft) return null;

  const alreadyClosed = draft.alreadySubmitted && draft.businessDate === today;
  if (done || alreadyClosed) {
    return (
      <Screen title={t('closing.title')} onBack={() => router.back()} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone={done === 'queued' ? 'warn' : 'accent'}>
            <Txt size={18} weight={600}>{done === 'sent' ? t('closing.submitted') : done === 'queued' ? t('closing.submittedOffline') : t('closing.already')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  const allCounted = lines.every((l) => {
    const g = toGrams(left[l.itemId] ?? '');
    return g !== null && g >= 0;
  });
  const moneyOk = toPaise(cash) !== null && toPaise(upi) !== null;

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
        lines: lines.map((l) => ({ itemId: l.itemId, closingGrams: toGrams(left[l.itemId])! })),
        cashPaise: toPaise(cash)!,
        upiPaise: toPaise(upi)!,
        note: note.trim(),
      },
      label: { key: 'app.queueClosing', params: { date: formatIstDate(capturedAt) } },
    });
    markClosedLocally();
    setBusy(false);
    setDone(r);
  };

  const v = result?.variancePaise ?? 0;
  const flagged = result?.varianceFlagged ?? false;
  const negatives = result?.negativeSoldLines ?? [];

  return (
    <Screen
      title={step === 2 ? t('closing.reviewTitle') : t('closing.title')}
      sub={t('closing.step', { date: formatIstDate(today), n: step + 1 })}
      tone={online ? 'ink' : 'offline'}
      onBack={() => (step === 0 ? router.back() : setStep(step - 1))}
      progress={{ step, of: 3 }}
      footer={
        step === 0 ? (
          <Cta label={t('closing.nextMoney')} disabled={!allCounted} onPress={() => setStep(1)} />
        ) : step === 1 ? (
          <Cta label={t('closing.nextReview')} disabled={!moneyOk} onPress={() => setStep(2)} />
        ) : (
          <>
            <Btn label={t('common.back')} onPress={() => setStep(1)} style={{ width: 96, height: 64 }} />
            <Cta tone={flagged || negatives.length ? 'danger' : 'success'} label={t('closing.submit')} busy={busy} disabled={!result} onPress={() => void submit()} />
          </>
        )
      }
    >
      {step === 0 && (
        <View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.divider }}>
            <Txt size={15} weight={600}>{t('closing.countLeft')}</Txt>
            {!allCounted && <Txt size={12} color={colors.textSubtle}>{t('closing.enterAll')}</Txt>}
          </View>
          {lines.map((l) => {
            const g = toGrams(left[l.itemId] ?? '');
            const available = l.openingGrams + l.receivedGrams - l.sentOutGrams + l.adjustmentGrams;
            const over = g !== null && g > available;
            return (
              <Row key={l.itemId}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={16} weight={600}>{nameIn(l)}</Txt>
                  <Txt size={11} color={colors.textSubtle}>
                    {t('closing.opened', { kg: formatKg(l.openingGrams) })}
                    {l.receivedGrams || l.sentOutGrams ? ` · ${t('closing.moved', { in: formatKg(l.receivedGrams), out: formatKg(l.sentOutGrams) })}` : ''}
                  </Txt>
                </View>
                <NumberField width={124} value={left[l.itemId] ?? ''} onChangeText={(x) => setLeft({ ...left, [l.itemId]: x })} unit={t('common.kg')} error={over} highlight={g === null} />
              </Row>
            );
          })}
        </View>
      )}

      {step === 1 && (
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

      {step === 2 && result && (
        <View style={{ padding: 16, gap: 14 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {[
              [t('closing.salesWorked'), formatRupees(result.expectedRevenuePaise, { whole: true }), colors.text],
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
          <Txt mono size={11} color={colors.textSubtle}>{t('closing.priceNote', { date: formatIstDate(today) })}</Txt>

          {negatives.length > 0 && (
            <Card tone="danger">
              <Txt size={17} weight={600} color={colors.dangerText}>{t('closing.negative', { items: negatives.map((l) => nameIn(lines.find((x) => x.itemId === l.itemId))).join(', ') })}</Txt>
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
