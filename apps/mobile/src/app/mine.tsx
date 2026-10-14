import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { formatIstDateTime, formatKg, statusTone } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors } from '../theme';
import { Row, Screen, SectionTitle, Tag, Txt } from '../ui';

/** The shop's own requests and issues with their status (read-only; works offline from cache). */
export default function Mine() {
  const { t } = useTranslation();
  const { snapshot, online } = useApp();
  if (!snapshot) return null;
  return (
    <Screen title={`${t('requestForm.mine')} · ${t('issueForm.mine')}`} tone={online ? 'ink' : 'offline'} onBack={() => router.back()}>
      <SectionTitle title={t('issueForm.mine')} />
      {snapshot.issues.slice(0, 30).map((i) => (
        <Row key={i.id} onPress={i.recountRequestedAt && !i.recountAt && i.status === 'OPEN' ? () => router.push(`/recount/${i.id}`) : undefined}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={15} weight={600}>{t(`issueType.${i.type}`)}</Txt>
            <Txt size={12} color={colors.textMuted}>{i.status === 'RESOLVED' && i.resolutionNote ? t('issueForm.resolvedNote', { note: i.resolutionNote }) : i.description}</Txt>
            <Txt mono size={10} color={colors.textFaint}>{i.ref} · {formatIstDateTime(i.createdAt)}</Txt>
          </View>
          <Tag label={t(`status.${i.status}`)} tone={i.status === 'RESOLVED' ? 'resolved' : 'danger'} />
        </Row>
      ))}
      <SectionTitle title={t('requestForm.mine')} />
      {snapshot.requests.slice(0, 30).map((r) => (
        <Row key={r.id}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt size={15} weight={600}>{r.lines.map((l) => `${nameIn(l)} ${formatKg(l.approvedGrams ?? l.requestedGrams)}`).join(', ')}</Txt>
            <Txt size={12} color={colors.textMuted}>{r.rejectReason ?? r.reason}</Txt>
            <Txt mono size={10} color={colors.textFaint}>{r.ref} · {formatIstDateTime(r.createdAt)}</Txt>
          </View>
          <Tag label={r.approvalType ? t(`status.${r.approvalType}`) : t(`status.${r.status}`)} tone={statusTone[r.status] ?? 'neutral'} />
        </Row>
      ))}
    </Screen>
  );
}
