import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { businessDate, formatIstDateTime, formatIstTime, formatKg, istTimeOn } from '@aram/shared';
import { nameIn } from '../lib/i18n';
import { useApp } from '../lib/store';
import { colors, radii } from '../theme';
import { Card, CountCard, Cta, Loading, Row, Screen, SectionTitle, SyncPill, Tag, Tile, Txt } from '../ui';

export default function Home() {
  const { t } = useTranslation();
  const { signedIn, snapshot: s, queue, rejected, dismissRejected, online, syncing, refresh, flush } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!signedIn) router.replace('/login');
  }, [signedIn]);

  if (!s) {
    return (
      <Screen title={t('app.home')}>
        <Loading />
      </Screen>
    );
  }

  const shop = s.me.shop!;
  const isSup = shop.type === 'SUPERVISOR';
  const openIssues = s.issues.filter((i) => i.status === 'OPEN');
  const recounts = openIssues.filter((i) => i.recountRequestedAt && !i.recountAt);
  const lowItems = s.stock.filter((i) => i.low);
  const chips = [...lowItems, ...s.stock.filter((i) => !i.low).sort((a, b) => b.onHandGrams - a.onHandGrams)].slice(0, 4);
  const today = businessDate();
  const due = s.draft.closingDueTime;
  const overdue = Date.now() > istTimeOn(today, due).getTime();
  const closedToday = s.draft.alreadySubmitted && s.draft.businessDate === today;
  const tone = !online ? 'offline' : isSup ? 'supervisor' : 'ink';

  const pull = async () => {
    setRefreshing(true);
    await flush();
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen
      title={nameIn(shop)}
      sub={`${shop.code} · ${t(`shopType.${shop.type}`)}`}
      tone={tone}
      onRefresh={() => void pull()}
      refreshing={refreshing}
      right={
        <Pressable onPress={() => router.push('/settings')} accessibilityLabel={t('app.settings')}>
          <SyncPill state={!online ? 'offline' : syncing ? 'syncing' : 'synced'} />
        </Pressable>
      }
      banner={
        !online || queue.length ? (
          <View style={{ backgroundColor: colors.warnBg, borderBottomWidth: 1, borderColor: colors.warnBorder, paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}>
            <Txt size={16} weight={600} color={colors.warnText}>{online ? t('app.queued') : t('app.offlineBanner', { n: queue.length })}</Txt>
            {!online && <Txt size={12} color={colors.warnText}>{t('app.offlineBannerSub', { n: queue.length })}</Txt>}
            <Txt mono size={11} color={colors.warnText}>{t('app.lastSynced', { when: formatIstDateTime(s.syncedAt) })}</Txt>
          </View>
        ) : undefined
      }
      footer={
        <Cta
          tone={closedToday ? 'success' : 'warn'}
          label={t('app.dailyClosing')}
          sub={closedToday ? t('app.closingDone') : overdue ? t('app.closingOverdue', { time: due }) : t('app.closingDue', { time: due })}
          disabled={closedToday}
          onPress={() => router.push('/closing')}
        />
      }
    >
      <View style={{ padding: 16, gap: 14 }}>
        {rejected.map((r) => (
          <Card key={r.clientId} tone="danger" style={{ gap: 8 }}>
            <Txt size={16} weight={600} color={colors.dangerText}>{t('app.rejectedTitle')} · {t(r.label.key, r.label.params)}</Txt>
            <Txt size={12} color={colors.dangerText}>
              {t('app.rejectedSub', { reason: r.errorCode.includes('.') ? t(r.errorCode, { defaultValue: r.error }) : r.error })}
            </Txt>
            <Pressable onPress={() => dismissRejected(r.clientId)}>
              <Txt size={13} weight={600} color={colors.dangerText} style={{ textDecorationLine: 'underline' }}>{t('app.dismiss')}</Txt>
            </Pressable>
          </Card>
        ))}

        {queue.length > 0 && (
          <View style={{ gap: 10 }}>
            {queue.map((q) => (
              <Card key={q.clientId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, borderStyle: 'dashed', borderColor: colors.offlineDot }} />
                <View style={{ flex: 1 }}>
                  <Txt size={16} weight={600}>{t(q.label.key, q.label.params)}</Txt>
                  {q.error && <Txt size={11} color={colors.dangerText}>{q.error}</Txt>}
                </View>
                <Txt mono size={11} weight={500} color={colors.warn}>{formatIstTime(q.createdAt)}</Txt>
              </Card>
            ))}
            {!online && <Txt size={12} color={colors.textSubtle}>{t('app.offlineWorks')}</Txt>}
            <Cta tone="outline" label={t('app.trySync')} busy={syncing} onPress={() => void flush()} />
          </View>
        )}

        {s.outgoing.map((d) => {
          const single = d.lines.length === 1 ? d.lines[0] : null;
          return (
            <View key={d.id} style={{ backgroundColor: colors.resolvedBg, borderWidth: 1, borderColor: colors.resolvedBorder, borderRadius: radii.card, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ backgroundColor: colors.resolved, borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 5 }}>
                  <Txt mono size={9} weight={600} color={colors.onAccent}>{t('app.hoOrder')}</Txt>
                </View>
                <Txt mono size={11} color={colors.resolved}>{d.ref}</Txt>
              </View>
              <Txt size={17} weight={600} color={colors.resolved}>
                {single
                  ? t('app.sendTo', { kg: formatKg(single.orderedGrams ?? 0), item: nameIn(single), shop: `${d.dest.code} ${nameIn(d.dest)}` })
                  : t('app.sendMany', { n: d.lines.length, shop: `${d.dest.code} ${nameIn(d.dest)}` })}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => router.push(`/transfer/${d.id}`)} style={{ flex: 1, height: 56, borderRadius: radii.xxl, backgroundColor: colors.resolved, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={16} weight={600} color={colors.onAccent}>{t('app.iSent')}</Txt>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/issue', params: { dispatchId: d.id, type: 'TRANSFER_PROBLEM' } })}
                  style={{ width: 120, height: 56, borderRadius: radii.xxl, borderWidth: 1.5, borderColor: colors.resolvedBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Txt size={15} weight={600} color={colors.resolved}>{t('app.problem')}</Txt>
                </Pressable>
              </View>
            </View>
          );
        })}

        {recounts.map((i) => (
          <CountCard key={i.id} n="!" tone="danger" title={t('app.recountAsked', { id: i.dispatch?.ref ?? i.ref })} sub={i.description} onPress={() => router.push(`/recount/${i.id}`)} />
        ))}

        <Card>
          <Txt size={16} weight={600}>{t('app.myStock')}</Txt>
          <Txt size={12} color={colors.textSubtle}>{t('app.myStockSub', { n: s.stock.length })}</Txt>
          <Txt mono size={34} weight={600} style={{ marginTop: 10 }}>
            {formatKg(Math.round(s.totalGrams / 1000) * 1000)}
            <Txt size={15} color={colors.textSubtle}> {t('common.kg')}</Txt>
          </Txt>
          <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {chips.map((c) => (
              <View key={c.itemId} style={{ borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.low ? colors.dangerBg : colors.neutralBg, flexDirection: 'row', gap: 6 }}>
                <Txt size={13} weight={500} color={c.low ? colors.dangerText : colors.textBody}>{nameIn(c)}</Txt>
                <Txt mono size={13} weight={600} color={c.low ? colors.dangerText : colors.textBody}>{formatKg(c.onHandGrams)}</Txt>
              </View>
            ))}
          </View>
          <Pressable onPress={() => router.push('/stock')} style={{ marginTop: 10 }}>
            <Txt size={12} weight={600} color={colors.accent}>→ {t('shops.stockByItem')}</Txt>
          </Pressable>
        </Card>

        <CountCard
          n={s.incoming.length}
          tone="accent"
          title={s.incoming.length ? t('app.deliveries') : t('app.noDeliveries')}
          sub={online ? s.incoming.map((d) => d.ref).join(' · ') : t('receive.needOnline')}
          onPress={s.incoming.length ? () => router.push('/receive') : undefined}
        />

        {openIssues.length > 0 && (
          <CountCard n={openIssues.length} tone="danger" title={t('app.openIssues')} sub={openIssues[0].description} onPress={() => router.push('/mine')} />
        )}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
          <Tile label={t('app.requestStock')} sub={t('requestForm.sub')} onPress={() => router.push('/request')} />
          <Tile label={t('app.reportProblem')} sub={t('issueForm.title')} onPress={() => router.push('/issue')} />
        </View>
        <Pressable onPress={() => router.push('/mine')}>
          <Txt size={13} weight={600} color={colors.accent} align="center">
            {t('requestForm.mine')} · {t('issueForm.mine')}
          </Txt>
        </Pressable>
      </View>

      {isSup && (
        <View>
          <SectionTitle title={t('app.mySmallShops')} sub={t('app.mySmallShopsSub')} />
          {s.children.length === 0 && <Txt size={13} color={colors.textSubtle} style={{ paddingHorizontal: 16 }}>{t('app.noSmallShops')}</Txt>}
          {s.children.map((c) => (
            <Row key={c.id} tone={c.low ? 'warn' : undefined}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={15} weight={600} numberOfLines={1}>{nameIn(c)}</Txt>
                <Txt mono size={11} color={colors.textSubtle}>{c.code}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt mono size={18} weight={600} color={c.low ? colors.warn : colors.textBody}>{formatKg(Math.round(c.totalGrams / 1000) * 1000)} {t('common.kg')}</Txt>
                {c.low && <Tag label={t('app.low')} tone="warn" />}
              </View>
            </Row>
          ))}
        </View>
      )}
    </Screen>
  );
}
