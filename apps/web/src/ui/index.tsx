'use client';
/**
 * Shared visual components. No data fetching or business rules in here —
 * screens pass data in. Restyling a component (via ui.css / tokens) restyles everywhere.
 */
import { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { statusTone, StatusTone } from '@aram/shared';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnVariant = 'default' | 'primary' | 'success' | 'danger' | 'danger-outline' | 'link';
export function Button({ variant = 'default', block, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; block?: boolean }) {
  return <button type="button" {...p} className={cx('btn', variant !== 'default' && `btn-${variant}`, block && 'btn-block', className)} />;
}

export function PageHeader({ title, sub, actions, plain }: { title: string; sub?: ReactNode; actions?: ReactNode; plain?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
        {plain && <div style={{ marginTop: 8 }}><span className="notice-plain">{t('common.notDesigned')}</span></div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, pad, style }: { children: ReactNode; className?: string; pad?: boolean; style?: CSSProperties }) {
  return <section className={cx('card', pad && 'pad', className)} style={style}>{children}</section>;
}

export function CardHead({ title, children, live }: { title: ReactNode; children?: ReactNode; live?: boolean }) {
  return (
    <div className="card-head">
      {live && <span className="dot live" style={{ background: 'var(--c-danger)' }} />}
      <span className="card-title">{title}</span>
      {children}
    </div>
  );
}

export function Kpi({ label, value, unit, sub, danger, children }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; danger?: boolean; children?: ReactNode }) {
  return (
    <div className={cx('kpi', danger && 'danger')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {children}
    </div>
  );
}

/** Status badge: tone comes from the shared status → tone map. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const { t } = useTranslation();
  const tone = statusTone[status] ?? 'neutral';
  return <span className={cx('badge', `tone-${tone}`)}>{label ?? t(`status.${status}`)}</span>;
}

export function Tag({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={cx('tag', `tone-${tone}`)}>{children}</span>;
}

export function Chip({ on, onClick, children, n }: { on?: boolean; onClick?: () => void; children: ReactNode; n?: number }) {
  return (
    <button type="button" className={cx('chip', on && 'on')} onClick={onClick}>
      {children}
      {n !== undefined && <span className="n">{n}</span>}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

export function Input({ className, big, numeric, ...p }: InputHTMLAttributes<HTMLInputElement> & { big?: boolean; numeric?: boolean }) {
  return <input {...p} className={cx('input', big && 'big', numeric && 'num-input', className)} />;
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx('select', className)} />;
}

export function TextArea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('textarea', className)} />;
}

export function FormError({ children }: { children?: ReactNode }) {
  return children ? <div className="form-error">{children}</div> : null;
}

/** Grid-row table. `cols` is the column template shared by header and rows. */
export function THead({ cols, children, minWidth }: { cols: string; children: ReactNode; minWidth?: number }) {
  return <div className="thead" style={{ gridTemplateColumns: cols, minWidth }}>{children}</div>;
}

export function TRow({ cols, children, onClick, selected, tone, minWidth }: { cols: string; children: ReactNode; onClick?: () => void; selected?: boolean; tone?: 'muted' | 'danger'; minWidth?: number }) {
  const cls = cx('trow', selected && 'sel', tone === 'muted' && 'muted-row', tone === 'danger' && 'danger-row');
  const style = { gridTemplateColumns: cols, minWidth };
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={cls} style={style}>{children}</div>
  );
}

/** Name + secondary line (e.g. code or parent). */
export function Cell({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span style={{ minWidth: 0 }}>
      <span className="cell-main ellipsis">{main}</span>
      {sub && <span className="cell-sub ellipsis">{sub}</span>}
    </span>
  );
}

export function Bar({ pct, tone }: { pct: number; tone?: 'danger' | 'warn' }) {
  return (
    <span className={cx('bar', tone)}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export function Toggle({ on, fixed, onChange, label }: { on: boolean; fixed?: boolean; onChange?: (v: boolean) => void; label: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={on} className={cx('toggle', fixed ? 'fixed' : on && 'on')} onClick={() => !fixed && onChange?.(!on)} disabled={fixed}>
      <span />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <span style={{ marginLeft: 'auto' }}>
            <Button variant="link" onClick={onClose} aria-label="close">✕</Button>
          </span>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <span className="spinner" />
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="empty">{children ?? t('common.noData')}</div>;
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 3200);
    return () => clearTimeout(id);
  }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function LangSwitch({ value, onChange, light }: { value: 'en' | 'ta'; onChange: (l: 'en' | 'ta') => void; light?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cx('lang', light && 'light')} role="group" aria-label={t('lang.label')}>
      <button type="button" className={cx(value === 'en' && 'on')} onClick={() => onChange('en')} lang="en">
        {t('lang.en')}
      </button>
      <button type="button" className={cx(value === 'ta' && 'on')} onClick={() => onChange('ta')} lang="ta">
        {t('lang.ta')}
      </button>
    </div>
  );
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return <span className="avatar" style={color ? { background: color } : undefined}>{initials}</span>;
}
