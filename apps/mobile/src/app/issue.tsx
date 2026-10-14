import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import { MANUAL_ISSUE_TYPES } from '@aram/shared';
import { useApp } from '../lib/store';
import { colors, fontFamily, radii } from '../theme';
import { Card, Chip, Cta, Screen, Txt } from '../ui';

export default function RaiseIssue() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ dispatchId?: string; type?: string }>();
  const { snapshot, enqueue, online } = useApp();
  const [type, setType] = useState<string>(params.type && MANUAL_ISSUE_TYPES.includes(params.type as never) ? params.type : 'DAMAGED_GOODS');
  const [text, setText] = useState('');
  const [dispatchId, setDispatchId] = useState<string | undefined>(params.dispatchId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'queued'>(null);

  const deliveries = [...(snapshot?.incoming ?? []), ...(snapshot?.outgoing ?? [])];

  const send = async () => {
    setBusy(true);
    const r = await enqueue({
      kind: 'issue',
      path: '/issues',
      body: { type, description: text.trim(), ...(dispatchId ? { dispatchId } : {}) },
      label: { key: 'app.queueIssue', params: { type: t(`issueType.${type}`) } },
    });
    setBusy(false);
    setDone(r);
  };

  if (done) {
    return (
      <Screen title={t('issueForm.title')} onBack={() => router.back()} footer={<Cta label={t('app.home')} onPress={() => router.replace('/home')} />}>
        <View style={{ padding: 16 }}>
          <Card tone={done === 'sent' ? 'accent' : 'warn'}>
            <Txt size={18} weight={600}>{done === 'sent' ? t('issueForm.sent') : t('issueForm.queued')}</Txt>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('issueForm.title')}
      tone={online ? 'ink' : 'offline'}
      onBack={() => router.back()}
      footer={<Cta tone="danger" label={t('issueForm.send')} disabled={!text.trim()} busy={busy} onPress={() => void send()} />}
    >
      <View style={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 10 }}>
          <Txt size={15} weight={600}>{t('issueForm.type')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MANUAL_ISSUE_TYPES.map((k) => (
              <Chip key={k} label={t(`issueType.${k}`)} on={type === k} onPress={() => setType(k)} />
            ))}
          </View>
        </View>
        {deliveries.length > 0 && (
          <View style={{ gap: 10 }}>
            <Txt size={15} weight={600}>{t('issueForm.dispatch')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {deliveries.map((d) => (
                <Chip key={d.id} label={d.ref} on={dispatchId === d.id} onPress={() => setDispatchId(dispatchId === d.id ? undefined : d.id)} />
              ))}
            </View>
          </View>
        )}
        <View style={{ gap: 6 }}>
          <Txt size={15} weight={600}>{t('issueForm.describe')}</Txt>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            style={{ minHeight: 120, borderWidth: 1.5, borderColor: colors.inputBorder, borderRadius: radii.xxl, backgroundColor: colors.card, padding: 12, fontSize: 15, fontFamily: fontFamily('text', 400, i18n.language), color: colors.text, textAlignVertical: 'top' }}
          />
        </View>
      </View>
    </Screen>
  );
}
