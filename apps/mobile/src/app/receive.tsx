import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { formatKg, kgToGrams } from '@aram/shared';
import { confirmReceipt, errorText, lookupDelivery } from '../lib/flows';
import { nameIn } from '../lib/i18n';
import { takePhoto } from '../lib/photo';
import { useApp } from '../lib/store';
import type { DispatchDetail } from '../lib/types';
import { colors, radii } from '../theme';
import { Banner, Card, CodeBoxes, Cta, Notice, Row, Screen, Stepper, Txt } from '../ui';
import { Scanner } from '../ui/Scanner';

const kgStr = (g: number) => formatKg(g).replace(/,/g, '');

export default function Receive() {
  const { t } = useTranslation();
  const { online, refresh, flush } = useApp();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [d, setD] = useState<DispatchDetail | null>(null);
  const [got, setGot] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'MATCHED' | 'DISCREPANCY' | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const lines = d?.lines ?? [];
  const gotGrams = (itemId: string) => {
    try {
      return kgToGrams(got[itemId] || '0');
    } catch {
      return -1;
    }
  };
  const mismatched = lines.filter((l) => gotGrams(l.itemId) !== l.sentGrams);
  const allValid = lines.every((l) => gotGrams(l.itemId) >= 0);

  const lookup = (c = code) =>
    run(async () => {
      await flush(); // anything queued offline goes first, so today's numbers stay in order
      const r = await lookupDelivery(c);
      setD(r);
      setGot(Object.fromEntries(r.lines.map((l) => [l.itemId, kgStr(l.sentGrams ?? 0)])));
      setStep(1);
    });

  const confirm = () =>
    run(async () => {
      const r = await confirmReceipt(d!.id, code, lines.map((l) => ({ itemId: l.itemId, receivedGrams: gotGrams(l.itemId) })), photo!);
      setResult(r.status);
      await refresh();
    });

  const back = () => (step === 0 || result ? router.back() : setStep(step - 1));

  if (result) {
    return (
      <Screen title={t('receive.title')} sub={d?.ref} onBack={() => router.replace('/home')} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone={result === 'MATCHED' ? 'accent' : 'danger'}>
            <Txt size={19} weight={600} color={result === 'MATCHED' ? colors.ink : colors.dangerText}>{t('receive.done')}</Txt>
            <Txt size={13} color={result === 'MATCHED' ? colors.accent : colors.dangerText}>{result === 'MATCHED' ? t('receive.doneMatched') : t('receive.doneDiscrepancy')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  const cta = [
    { label: t('auth.continue'), onPress: () => void lookup(), disabled: code.length !== 6 },
    { label: t('receive.nextPhoto'), onPress: () => setStep(2), disabled: !allValid },
    { label: t('receive.nextReview'), onPress: () => setStep(3), disabled: !photo },
    { label: t('receive.confirm'), onPress: () => void confirm(), disabled: !photo, tone: 'success' as const },
  ][step];

  return (
    <Screen
      title={t('receive.title')}
      sub={`${d ? d.ref + ' · ' : ''}${t('receive.step', { n: step + 1 })}`}
      onBack={back}
      progress={{ step, of: 4 }}
      banner={!online ? <Banner tone="warn" title={t('app.needsOnline')} sub={t('receive.needOnline')} /> : undefined}
      footer={<Cta label={cta.label} onPress={cta.onPress} disabled={cta.disabled || !online} busy={busy} tone={cta.tone ?? 'ink'} />}
    >
      {error && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <Notice>{error}</Notice>
        </View>
      )}

      {step === 0 && (
        <View style={{ padding: 16, gap: 16 }}>
          <Card style={{ alignItems: 'center' }}>
            <Txt size={19} weight={600} align="center">{t('receive.scan')}</Txt>
            <Scanner
              onCode={(c) => {
                setCode(c);
                void lookup(c);
              }}
            />
          </Card>
          <Txt size={13} color={colors.textSubtle} align="center">{t('receive.or')}</Txt>
          <Card>
            <Txt size={16} weight={600}>{t('receive.enterCode')}</Txt>
            <View style={{ marginTop: 12 }}>
              <CodeBoxes value={code} onChange={setCode} />
            </View>
          </Card>
        </View>
      )}

      {step === 1 && d && (
        <View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.accentSoft, borderBottomWidth: 1, borderColor: colors.accentSoftBorder }}>
            <Txt size={15} weight={600}>{t('receive.from', { id: d.ref, from: nameIn(d.source) })}</Txt>
            <Txt size={12} color={colors.accent}>{t('receive.enterActual')}</Txt>
          </View>
          {lines.map((l) => {
            const diff = gotGrams(l.itemId) - (l.sentGrams ?? 0);
            return (
              <Row key={l.itemId} tone={diff ? 'danger' : undefined} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Txt size={17} weight={600} style={{ flex: 1 }}>{nameIn(l)}</Txt>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt mono size={11} color={colors.textSubtle}>{t('receive.sent')}</Txt>
                    <Txt mono size={16} weight={600}>{formatKg(l.sentGrams ?? 0)} {t('common.kg')}</Txt>
                  </View>
                </View>
                <Stepper value={got[l.itemId] ?? ''} onChange={(v) => setGot({ ...got, [l.itemId]: v })} step={5} unit={t('common.kg')} error={!!diff} />
                {diff !== 0 && gotGrams(l.itemId) >= 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: radii.xl, paddingHorizontal: 11, paddingVertical: 9 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger }} />
                    <Txt size={14} weight={600} color={colors.dangerText} style={{ flex: 1 }}>{diff < 0 ? t('receive.short') : t('receive.over')}</Txt>
                    <Txt mono size={14} weight={600} color={colors.dangerText}>{diff > 0 ? '+' : ''}{formatKg(diff)} {t('common.kg')}</Txt>
                  </View>
                )}
              </Row>
            );
          })}
        </View>
      )}

      {step === 2 && (
        <View style={{ padding: 16, gap: 14 }}>
          <View>
            <Txt size={19} weight={600}>{t('receive.photoTitle')}</Txt>
            <Txt size={13} color={colors.textMuted}>{t('receive.photoSub')}</Txt>
          </View>
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: '100%', height: 320, borderRadius: radii.card }} resizeMode="cover" />
          ) : (
            <View style={{ height: 320, borderRadius: radii.card, borderWidth: 1, borderColor: colors.scrollbar, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' }}>
              <Txt mono size={12} color={colors.textSubtle}>📷</Txt>
            </View>
          )}
          <Cta tone={photo ? 'outline' : 'ink'} label={photo ? t('receive.retake') : t('receive.takePhoto')} onPress={() => void takePhoto().then((u) => u && setPhoto(u))} />
        </View>
      )}

      {step === 3 && d && (
        <View style={{ padding: 16, gap: 14 }}>
          {mismatched.length ? (
            <Card tone="danger">
              <Txt size={18} weight={600} color={colors.dangerText}>{t('receive.mismatch', { n: mismatched.length })}</Txt>
              <Txt size={12} color={colors.dangerText}>{t('receive.mismatchSub', { n: mismatched.length })}</Txt>
            </Card>
          ) : (
            <Card tone="accent">
              <Txt size={18} weight={600}>{t('receive.allMatch')}</Txt>
              <Txt size={12} color={colors.accent}>{t('receive.allMatchSub')}</Txt>
            </Card>
          )}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {lines.map((l) => {
              const ok = gotGrams(l.itemId) === l.sentGrams;
              return (
                <Row key={l.itemId} tone={ok ? undefined : 'danger'}>
                  <Txt size={15} weight={600} style={{ flex: 1 }}>{nameIn(l)}</Txt>
                  <Txt mono size={13} color={colors.textSubtle}>{formatKg(l.sentGrams ?? 0)}</Txt>
                  <Txt mono size={13} color={colors.textSubtle}>→</Txt>
                  <Txt mono size={16} weight={600} color={ok ? colors.successText : colors.dangerText}>{formatKg(gotGrams(l.itemId))}</Txt>
                </Row>
              );
            })}
          </Card>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
            {photo && <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: radii.xl }} />}
            <Txt size={13} color={colors.textMuted}>{t('receive.photoAttached')}</Txt>
          </Card>
        </View>
      )}
    </Screen>
  );
}
