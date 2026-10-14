import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { formatIstDateTime } from '@aram/shared';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Card, Check, Cta, LangSwitch, Screen, Txt } from '../ui';

export default function Settings() {
  const { t } = useTranslation();
  const { snapshot, language, setLanguage, simOffline, setSimOffline, signOut, queue, online } = useApp();
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
          {/* Preview-only: lets you try offline mode in a browser without disconnecting. */}
          <Pressable onPress={() => setSimOffline(!simOffline)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Check on={simOffline} />
            <Txt size={14}>{t('app.simOffline')}</Txt>
          </Pressable>
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
