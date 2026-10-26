import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { formatIstDateTime } from '@aram/shared';
import { changePassword, errorText } from '../lib/flows';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Card, Check, Cta, Input, LangSwitch, Notice, Screen, Txt } from '../ui';

export default function Settings() {
  const { t } = useTranslation();
  const { snapshot, language, setLanguage, simOffline, setSimOffline, signOut, queue, online } = useApp();
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const savePassword = async () => {
    if (pw.next !== pw.again) return setMsg({ tone: 'danger', text: t('auth.passwordMismatch') });
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', again: '' });
      setMsg({ tone: 'success', text: t('auth.passwordChanged') });
    } catch (e) {
      setMsg({ tone: 'danger', text: errorText(e, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('app.settings')} sub={snapshot?.me.shop ? `${snapshot.me.shop.code} · ${snapshot.me.username}` : undefined} tone={online ? 'ink' : 'offline'} onBack={() => router.back()}>
      <View style={{ padding: 16, gap: 14 }}>
        <Card style={{ gap: 10 }}>
          <Txt size={16} weight={600}>{t('lang.label')}</Txt>
          <LangSwitch value={language} onChange={setLanguage} />
        </Card>
        <Card style={{ gap: 6 }}>
          <Txt size={16} weight={600}>{online ? t('app.synced') : t('app.offline')}</Txt>
          {snapshot && <Txt size={12} color={colors.textSubtle}>{t('app.lastSynced', { when: formatIstDateTime(snapshot.syncedAt) })}</Txt>}
          <Txt size={12} color={colors.textSubtle}>{t('app.queued')}: {queue.length}</Txt>
          {/* Browser preview only: lets you try offline mode without disconnecting. Phones go offline for real. */}
          {Platform.OS === 'web' && (
            <Pressable onPress={() => setSimOffline(!simOffline)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Check on={simOffline} />
              <Txt size={14}>{t('app.simOffline')}</Txt>
            </Pressable>
          )}
        </Card>
        <Card style={{ gap: 10 }}>
          <Txt size={16} weight={600}>{t('auth.changePassword')}</Txt>
          <Input secureTextEntry placeholder={t('auth.currentPassword')} value={pw.current} onChangeText={(v) => setPw({ ...pw, current: v })} />
          <Input secureTextEntry placeholder={t('auth.newPassword')} value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} />
          <Input secureTextEntry placeholder={t('auth.confirmPassword')} value={pw.again} onChangeText={(v) => setPw({ ...pw, again: v })} />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Cta
            tone="accent"
            label={t('auth.changePassword')}
            busy={busy}
            disabled={!online || !pw.current || pw.next.length < 8}
            onPress={() => void savePassword()}
          />
          {!online && <Txt size={12} color={colors.textSubtle}>{t('app.needsOnline')}</Txt>}
        </Card>
        <Cta
          tone="outline"
          label={t('common.signOut')}
          onPress={() => {
            signOut();
            router.replace('/login');
          }}
        />
      </View>
    </Screen>
  );
}
