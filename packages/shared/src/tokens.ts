/**
 * Design tokens from /design (Claude Design handoff v2).
 * Every colour, font, radius and spacing value used by the web dashboard and the
 * Android app comes from here. Restyle by editing this file, not screens.
 */
export const colors = {
  // Brand / ink
  ink: '#173a2a',
  inkSoft: '#224b37',
  inkLine: '#2f5a45',
  accent: '#1f5a3d',
  accentHover: '#17462f',
  accentSoft: '#e5efe8',
  accentSoftBorder: '#cfe0d5',
  gold: '#e3b85a',
  onInk: '#f2f2ec',
  onInkMuted: '#a9bfb0',
  onInkFaint: '#b9bcb0',

  // Surfaces
  page: '#f0ebdf',
  canvas: '#f8f5ed',
  appCanvas: '#f9f6ee',
  card: '#ffffff',
  sidebar: '#ece6d6',
  rowAlt: '#faf7ef',
  footerRow: '#faf9f4',
  inputBg: '#fcfaf4',
  track: '#efe9da',

  // Lines
  border: '#ddd5c1',
  cardBorder: '#e7e0cd',
  divider: '#efe9da',
  dividerSoft: '#f3efe4',
  dividerFaint: '#f7f3e9',
  inputBorder: '#e2dbc8',
  scrollbar: '#d8cfb8',

  // Text
  text: '#173a2a',
  textBody: '#3e4239',
  textMuted: '#6a6454',
  textSubtle: '#8c8570',
  textFaint: '#a39c86',
  onAccent: '#ffffff',

  // Status
  danger: '#9b2335',
  dangerText: '#85192b',
  dangerBg: '#fae9e7',
  dangerRowBg: '#fdf6f5',
  dangerBorder: '#ecc9ce',
  dangerInput: '#e08078',
  warn: '#9a6a12',
  warnText: '#8a4a12',
  warnBg: '#fdf3ea',
  warnBorder: '#f0dcc2',
  success: '#3f7d5c',
  successText: '#2f6b4d',
  successBg: '#e6f0ea',
  info: '#3d6b85',
  infoBg: '#eaf0f4',
  resolved: '#8d3f6e',
  resolvedBg: '#f6eaf1',
  resolvedBorder: '#d9c3d2',
  neutralBg: '#f2f2ec',
  createdBg: '#eee9dc',
  online: '#6fae8c',
  onlineBright: '#7fd2a4',

  // App headers
  offlineHeader: '#5c4a1e',
  offlinePill: '#87692a',
  offlineDot: '#f0c463',
  supervisorHeader: '#3d2b46',
  supervisorSub: '#cdbdd6',
  offlineSub: '#e0d3b4',
  offlinePillText: '#f7e6bd',
  onlinePill: '#28563f',
  onlinePillText: '#bfe9d1',
  selectedRow: '#f4f8f5',
  onInkGhost: 'rgba(255,255,255,0.12)',
  overlay: 'rgba(23,58,42,0.35)',
  shadow: 'rgba(0,0,0,0.18)',
} as const;

export const fonts = {
  latin: 'Anek Latin',
  tamil: 'Anek Tamil',
  mono: 'IBM Plex Mono',
} as const;

export const radii = { xs: 4, sm: 5, md: 7, lg: 8, xl: 10, xxl: 12, card: 14, pill: 20 } as const;

export const space = { 1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 14, 7: 16, 8: 18, 9: 20, 10: 24, 11: 28 } as const;

/** Mobile ergonomics from the design: 56px tap targets, 64px primary CTA. */
export const touch = { target: 56, cta: 64, input: 60 } as const;

export type StatusTone = 'neutral' | 'created' | 'accent' | 'info' | 'success' | 'danger' | 'warn' | 'resolved';

export const tones: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutralBg, fg: colors.textBody },
  created: { bg: colors.createdBg, fg: colors.textMuted },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  info: { bg: colors.infoBg, fg: colors.info },
  success: { bg: colors.successBg, fg: colors.successText },
  danger: { bg: colors.dangerBg, fg: colors.dangerText },
  warn: { bg: colors.warnBg, fg: colors.warn },
  resolved: { bg: colors.resolvedBg, fg: colors.resolved },
};

/** Status → tone. Shared so a status looks the same on web and app. */
export const statusTone: Record<string, StatusTone> = {
  CREATED: 'created',
  DISPATCHED: 'accent',
  RECEIVED: 'info',
  MATCHED: 'success',
  DISCREPANCY: 'danger',
  RESOLVED: 'resolved',
  PENDING: 'neutral',
  APPROVED: 'success',
  REJECTED: 'danger',
  OPEN: 'danger',
  AUTO: 'danger',
  SHOP: 'neutral',
};
