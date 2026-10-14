/**
 * Shared visual components for the shop app. Pure presentation: no API calls, no business rules.
 * Sizes follow the design: 56px tap targets, 64px primary buttons, numbers in mono 22px+.
 */
import { ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, radii, tones, touch, type Weight } from '../theme';
import type { StatusTone } from '@aram/shared';

// ---------------------------------------------------------------------------
export function Txt({
  children,
  size = 15,
  weight = 400,
  mono,
  color = colors.text,
  style,
  numberOfLines,
  align,
}: {
  children: ReactNode;
  size?: number;
  weight?: Weight;
  mono?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: 'left' | 'right' | 'center';
}) {
  const { i18n } = useTranslation();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: fontFamily(mono ? 'mono' : 'text', weight, i18n.language), fontSize: size, lineHeight: Math.round(size * (mono ? 1.2 : 1.35)), color, textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
export type HeaderTone = 'ink' | 'offline' | 'supervisor';
const headerBg: Record<HeaderTone, string> = { ink: colors.ink, offline: colors.offlineHeader, supervisor: colors.supervisorHeader };
const headerSub: Record<HeaderTone, string> = { ink: colors.onInkFaint, offline: colors.offlineSub, supervisor: colors.supervisorSub };

export function Screen({
  title,
  sub,
  tone = 'ink',
  onBack,
  right,
  children,
  footer,
  scroll = true,
  banner,
  progress,
  onRefresh,
  refreshing = false,
}: {
  title: string;
  sub?: string;
  tone?: HeaderTone;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  banner?: ReactNode;
  progress?: { step: number; of: number };
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.appCanvas }}>
      <View style={[s.header, { backgroundColor: headerBg[tone], paddingTop: 14 + insets.top }]}>
        {onBack && (
          <Pressable accessibilityRole="button" onPress={onBack} style={s.back}>
            <Txt size={18} weight={600} color={colors.onAccent}>←</Txt>
          </Pressable>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={17} weight={600} color={colors.onAccent} numberOfLines={1}>{title}</Txt>
          {sub ? <Txt size={12} color={headerSub[tone]} numberOfLines={1}>{sub}</Txt> : null}
        </View>
        {right}
      </View>
      {progress && (
        <View style={s.progress}>
          {Array.from({ length: progress.of }).map((_, i) => (
            <View key={i} style={[s.progressBar, { backgroundColor: i <= progress.step ? colors.accent : colors.track }]} />
          ))}
        </View>
      )}
      {banner}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer && <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>{footer}</View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
type CtaTone = 'ink' | 'accent' | 'success' | 'danger' | 'warn' | 'resolved' | 'outline';
const ctaBg: Record<CtaTone, string> = { ink: colors.ink, accent: colors.accent, success: colors.success, danger: colors.dangerText, warn: colors.warn, resolved: colors.resolved, outline: colors.card };

/** Primary 64px action with an optional second line. */
export function Cta({ label, sub, onPress, tone = 'ink', disabled, busy, style }: { label: string; sub?: string; onPress: () => void; tone?: CtaTone; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const outline = tone === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.cta,
        { backgroundColor: ctaBg[tone], opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        outline && { borderWidth: 1.5, borderColor: colors.inputBorder },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={outline ? colors.ink : colors.onAccent} />
      ) : (
        <>
          <Txt size={outline ? 17 : 19} weight={600} color={outline ? colors.text : colors.onAccent} align="center">{label}</Txt>
          {sub ? <Txt size={12} color={outline ? colors.textSubtle : colors.onAccent} style={{ opacity: 0.85 }} align="center">{sub}</Txt> : null}
        </>
      )}
    </Pressable>
  );
}

/** Secondary button (56px). */
export function Btn({ label, onPress, tone = 'default', disabled, style }: { label: string; onPress: () => void; tone?: 'default' | 'resolved' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const fill = tone === 'resolved';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        fill ? { backgroundColor: colors.resolved, borderColor: colors.resolved } : { borderColor: tone === 'danger' ? colors.dangerBorder : colors.inputBorder },
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Txt size={16} weight={600} color={fill ? colors.onAccent : tone === 'danger' ? colors.dangerText : colors.text} align="center">{label}</Txt>
    </Pressable>
  );
}

export function Tile({ label, sub, onPress, disabled }: { label: string; sub?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.tile, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      <Txt size={16} weight={600} align="center">{label}</Txt>
      {sub ? <Txt size={11} color={colors.textSubtle} align="center">{sub}</Txt> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' | 'accent' | 'warn' | 'resolved' }) {
  const t = tone ? toneCard[tone] : null;
  return <View style={[s.card, t && { backgroundColor: t.bg, borderColor: t.border }, style]}>{children}</View>;
}
const toneCard = {
  danger: { bg: colors.dangerBg, border: colors.dangerBorder },
  accent: { bg: colors.accentSoft, border: colors.accentSoftBorder },
  warn: { bg: colors.warnBg, border: colors.warnBorder },
  resolved: { bg: colors.resolvedBg, border: colors.resolvedBorder },
};

/** Tappable card row with a count badge (home screen). */
export function CountCard({ n, title, sub, tone, onPress }: { n: number | string; title: string; sub?: string; tone: 'accent' | 'danger' | 'warn'; onPress?: () => void }) {
  const badge = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.warn;
  const fg = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.dangerText : colors.warnText;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card tone={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[s.countBadge, { backgroundColor: badge }]}>
          <Txt mono size={18} weight={600} color={colors.onAccent}>{n}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={17} weight={600} color={tone === 'accent' ? colors.ink : fg}>{title}</Txt>
          {sub ? <Txt size={12} color={fg}>{sub}</Txt> : null}
        </View>
      </Card>
    </Pressable>
  );
}

export function Row({ children, style, tone, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' | 'accent' | 'warn'; onPress?: () => void }) {
  const bg = tone === 'danger' ? colors.dangerRowBg : tone === 'accent' ? colors.selectedRow : tone === 'warn' ? colors.warnBg : colors.card;
  const body = <View style={[s.row, { backgroundColor: bg }, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Banner({ title, sub, tone }: { title: string; sub?: string; tone: 'danger' | 'warn' | 'success' | 'accent' }) {
  const m = {
    danger: { bg: colors.dangerBg, border: colors.dangerBorder, fg: colors.dangerText },
    warn: { bg: colors.warnBg, border: colors.warnBorder, fg: colors.warnText },
    success: { bg: colors.successBg, border: colors.accentSoftBorder, fg: colors.successText },
    accent: { bg: colors.accentSoft, border: colors.accentSoftBorder, fg: colors.accent },
  }[tone];
  return (
    <View style={{ backgroundColor: m.bg, borderBottomWidth: 1, borderColor: m.border, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Txt size={16} weight={600} color={m.fg}>{title}</Txt>
      {sub ? <Txt size={12} color={m.fg}>{sub}</Txt> : null}
    </View>
  );
}

export function Notice({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'warn' | 'success' }) {
  const m = { danger: [colors.dangerBg, colors.dangerText, colors.danger], warn: [colors.warnBg, colors.warnText, colors.warn], success: [colors.successBg, colors.successText, colors.success] }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: m[0], borderRadius: radii.xl, paddingHorizontal: 11, paddingVertical: 9 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: m[2] }} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Txt size={14} weight={600} color={m[1]}>{children}</Txt> : children}</View>
    </View>
  );
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return (
    <View style={{ backgroundColor: tones[tone].bg, borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 5, alignSelf: 'flex-start' }}>
      <Txt mono size={9} weight={600} color={tones[tone].fg}>{label}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
/** Large numeric field with a unit (kg / ₹). */
export function NumberField({ value, onChangeText, unit, error, width, highlight, placeholder, ...rest }: TextInputProps & { unit?: string; error?: boolean; width?: number; highlight?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <View
      style={[
        s.numField,
        { width, borderColor: error ? colors.dangerInput : highlight ? colors.accent : colors.inputBorder, backgroundColor: error ? colors.dangerRowBg : highlight ? colors.card : colors.inputBg },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        inputMode="decimal"
        keyboardType="decimal-pad"
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.textFaint}
        style={[s.numInput, { fontFamily: fontFamily('mono', 600, i18n.language) }]}
        {...rest}
      />
      {unit ? <Txt mono size={13} color={colors.textSubtle}>{unit}</Txt> : null}
    </View>
  );
}

/** − [value] + with 56px targets (receive screen). */
export function Stepper({ value, onChange, step, unit, error }: { value: string; onChange: (v: string) => void; step: number; unit: string; error?: boolean }) {
  const bump = (d: number) => {
    const n = Math.max(0, Math.round(((Number(value) || 0) + d) * 1000) / 1000);
    onChange(String(n));
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable accessibilityLabel="minus" onPress={() => bump(-step)} style={s.stepBtn}>
        <Txt size={24} weight={600}>−</Txt>
      </Pressable>
      <View style={{ flex: 1 }}>
        <NumberField value={value} onChangeText={onChange} unit={unit} error={error} highlight={!error} />
      </View>
      <Pressable accessibilityLabel="plus" onPress={() => bump(step)} style={s.stepBtn}>
        <Txt size={24} weight={600}>+</Txt>
      </Pressable>
    </View>
  );
}

export function Input(props: TextInputProps & { big?: boolean; mono?: boolean }) {
  const { i18n } = useTranslation();
  const { big, mono, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      style={[s.input, big && { height: touch.input, fontSize: 18 }, { fontFamily: fontFamily(mono ? 'mono' : 'text', 500, i18n.language) }, style]}
      {...rest}
    />
  );
}

/** Six boxes backed by one hidden input (delivery code / OTP). */
export function CodeBoxes({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[s.codeBox, { borderColor: i === value.length ? colors.accent : colors.inputBorder }]}>
          <Txt mono size={22} weight={600}>{value[i] ?? ''}</Txt>
        </View>
      ))}
      <TextInput
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        style={s.hiddenInput}
      />
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on ? { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft } : { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
      <Txt size={14} weight={600} color={colors.ink}>{label}</Txt>
    </Pressable>
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <View style={[s.check, on ? { backgroundColor: colors.accent, borderColor: colors.accent } : { backgroundColor: colors.card, borderColor: colors.scrollbar }]}>
      {on ? <Txt size={15} weight={600} color={colors.onAccent}>✓</Txt> : null}
    </View>
  );
}

export function SyncPill({ state }: { state: 'synced' | 'offline' | 'syncing' }) {
  const { t } = useTranslation();
  const m = {
    synced: { bg: colors.onlinePill, dot: colors.onlineBright, fg: colors.onlinePillText, label: t('app.synced') },
    syncing: { bg: colors.onlinePill, dot: colors.offlineDot, fg: colors.onlinePillText, label: t('app.syncing') },
    offline: { bg: colors.offlinePill, dot: colors.offlineDot, fg: colors.offlinePillText, label: t('app.offline') },
  }[state];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: m.bg, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: m.dot }} />
      <Txt size={12} weight={600} color={m.fg}>{m.label}</Txt>
    </View>
  );
}

export function LangSwitch({ value, onChange, dark }: { value: 'en' | 'ta'; onChange: (l: 'en' | 'ta') => void; dark?: boolean }) {
  const { t } = useTranslation();
  const opt = (l: 'en' | 'ta', label: string) => {
    const on = value === l;
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(l)} style={[s.langBtn, on && { backgroundColor: dark ? colors.onInk : colors.card }]}>
        <Text style={{ fontFamily: fontFamily('text', 600, l), fontSize: 13, color: on ? colors.ink : dark ? colors.onInkFaint : colors.textMuted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[s.lang, { backgroundColor: dark ? colors.inkSoft : colors.sidebar }]}>
      {opt('en', t('lang.en'))}
      {opt('ta', t('lang.ta'))}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
      <Txt size={15} weight={600}>{title}</Txt>
      {sub ? <Txt size={11} color={colors.textSubtle}>{sub}</Txt> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: radii.xl, backgroundColor: colors.onInkGhost, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.divider },
  progressBar: { flex: 1, height: 6, borderRadius: 3 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.divider, flexDirection: 'row', gap: 10 },
  cta: { flex: 1, minHeight: touch.cta, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  btn: { height: touch.target, borderRadius: radii.xxl, borderWidth: 1.5, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  tile: { flex: 1, height: 104, borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 4 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.card, padding: 16 },
  countBadge: { width: 44, height: 44, borderRadius: radii.xxl, alignItems: 'center', justifyContent: 'center' },
  row: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 12 },
  numField: { height: touch.target, borderWidth: 1.5, borderRadius: radii.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 5 },
  numInput: { flex: 1, minWidth: 0, fontSize: 22, textAlign: 'center', color: colors.text, padding: 0, outlineStyle: 'none' } as unknown as TextStyle, // outlineStyle: web-only, hides the focus ring
  stepBtn: { width: touch.target, height: touch.target, borderRadius: radii.xxl, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  input: { height: 52, borderWidth: 1.5, borderColor: colors.inputBorder, borderRadius: radii.xxl, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, color: colors.text },
  codeBox: { flex: 1, height: 58, borderWidth: 1.5, borderRadius: radii.xl, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  chip: { borderRadius: radii.xl, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1.5 },
  check: { width: 26, height: 26, borderRadius: radii.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  lang: { flexDirection: 'row', borderRadius: radii.lg, padding: 3, gap: 2 },
  langBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
});
