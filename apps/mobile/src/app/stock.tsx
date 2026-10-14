import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { formatKg } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Row, Screen, Tag, Txt } from '../ui';

export default function Stock() {
  const { t } = useTranslation();
  const { snapshot, online } = useApp();
  if (!snapshot) return null;
  return (
    <Screen title={t('app.myStock')} sub={t('app.myStockSub', { n: snapshot.stock.length })} tone={online ? 'ink' : 'offline'} onBack={() => router.back()}>
      {snapshot.stock.map((s) => (
        <Row key={s.itemId} tone={s.low ? 'danger' : s.watch ? 'warn' : undefined}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={16} weight={600}>{nameIn(s)}</Txt>
            {s.daysLeft !== null && <Txt size={11} color={colors.textSubtle}>{t('shops.daysLeft', { d: s.daysLeft.toFixed(1) })}</Txt>}
          </View>
          {s.low && <Tag label={t('shops.flagLow')} tone="danger" />}
          <Txt mono size={20} weight={600}>{formatKg(s.onHandGrams)}</Txt>
          <Txt mono size={12} color={colors.textSubtle}>{t('common.kg')}</Txt>
        </Row>
      ))}
    </Screen>
  );
}
