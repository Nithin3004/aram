import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import { formatKg, kgToGrams } from '@aram/shared';
import { errorText, getDispatch, submitRecount } from '../../lib/flows';
import { nameIn } from '../../lib/i18n';
import { useApp } from '../../lib/store';
import type { DispatchDetail } from '../../lib/types';
import { colors, fontFamily, radii } from '../../theme';
import { Banner, Cta, Loading, Notice, Row, Screen, Stepper, Txt } from '../../ui';

/** HO asked this shop to recount a mismatched delivery. */
export default function Recount() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, online, refresh } = useApp();
  const issue = snapshot?.issues.find((i) => i.id === id);
  const [d, setD] = useState<DispatchDetail | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!issue?.dispatch) return;
    getDispatch(issue.dispatch.id)
      .then((r) => {
        setD(r);
        setQty(Object.fromEntries(r.lines.map((l) => [l.itemId, formatKg(l.receivedGrams ?? 0).replace(/,/g, '')])));
      })
      .catch((e) => setError(errorText(e, t)));
  }, [issue?.dispatch, t]);

  if (!issue) return null;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitRecount(issue.id, d!.lines.map((l) => ({ itemId: l.itemId, receivedGrams: kgToGrams(qty[l.itemId] || '0') })), note.trim());
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
      title={t('app.recount')}
      sub={issue.dispatch?.ref}
      onBack={() => router.back()}
      banner={!online ? <Banner tone="warn" title={t('app.needsOnline')} /> : <Banner tone="danger" title={t('app.recountAsked', { id: issue.dispatch?.ref ?? issue.ref })} sub={issue.description} />}
      footer={<Cta tone="danger" label={t('app.recountSubmit')} busy={busy} disabled={!online || !d} onPress={() => void send()} />}
    >
      {error && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <Notice>{error}</Notice>
        </View>
      )}
      {!d && !error && <Loading />}
      {d?.lines.map((l) => (
        <Row key={l.itemId} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={17} weight={600}>{nameIn(l)}</Txt>
            <Txt mono size={13} color={colors.textSubtle}>{t('receive.sent')} {formatKg(l.sentGrams ?? 0)}</Txt>
          </View>
          <Stepper value={qty[l.itemId] ?? ''} onChange={(v) => setQty({ ...qty, [l.itemId]: v })} step={1} unit={t('common.kg')} />
        </Row>
      ))}
      <View style={{ padding: 16 }}>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={t('closing.reason')}
          placeholderTextColor={colors.textFaint}
          style={{ minHeight: 64, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radii.xl, backgroundColor: colors.card, padding: 10, fontSize: 14, fontFamily: fontFamily('text', 400, i18n.language), color: colors.text, textAlignVertical: 'top' }}
        />
      </View>
    </Screen>
  );
}
