'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/hooks';
import { Avatar, Button, LangSwitch, Loading } from '../../ui';

interface NavCounts {
  shops: number;
  supervisors: number;
  small: number;
  dispatches: number;
  requests: number;
  issues: number;
}

const GROUPS: { group: string; links: { href: string; key: string; badge?: keyof NavCounts; tone?: 'danger' | 'warn'; superOnly?: boolean }[] }[] = [
  { group: 'nav.network', links: [{ href: '/', key: 'nav.overview' }, { href: '/shops', key: 'nav.shops' }] },
  {
    group: 'nav.stockMovement',
    links: [
      { href: '/dispatches', key: 'nav.dispatches', badge: 'dispatches', tone: 'danger' },
      { href: '/requests', key: 'nav.requests', badge: 'requests', tone: 'warn' },
      { href: '/issues', key: 'nav.issues', badge: 'issues', tone: 'danger' },
    ],
  },
  { group: 'nav.catalogue', links: [{ href: '/items', key: 'nav.items' }, { href: '/vendors', key: 'nav.vendors' }] },
  {
    group: 'nav.control',
    links: [
      { href: '/admins', key: 'nav.admins' },
      { href: '/audit', key: 'nav.audit' },
      { href: '/settings', key: 'nav.settings' },
    ],
  },
];

export default function DashLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { me, ready, language, setLanguage, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = useData<NavCounts>(me ? '/dashboard/nav' : null);

  useEffect(() => {
    if (ready && !me) router.replace('/login');
  }, [ready, me, router]);

  // Refresh badges on navigation and every minute.
  const reloadNav = nav.reload;
  useEffect(() => {
    setOpen(false);
    void reloadNav();
  }, [path, reloadNav]);
  useEffect(() => {
    const id = setInterval(() => void reloadNav(), 60_000);
    return () => clearInterval(id);
  }, [reloadNav]);

  if (!ready || !me) return <Loading />;
  const counts = nav.data;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label={t('nav.menu')}>
          ☰
        </button>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <span className="brand-ta">{t('brand.tamilMark')}</span>
            <span className="brand-en">{t('brand.short')}</span>
          </span>
          <span className="brand-name">{t('brand.name')}</span>
        </Link>
        <div className="topbar-meta">
          {counts && <span className="hide-sm">{t('header.network', { shops: counts.shops, sup: counts.supervisors, small: counts.small })}</span>}
          <span className="topbar-live hide-sm">
            <span className="dot" style={{ background: 'var(--c-online)' }} />
            {t('header.live')}
          </span>
          <LangSwitch value={language} onChange={setLanguage} />
        </div>
      </header>

      <div className="body">
        {open && <div className="nav-scrim" onClick={() => setOpen(false)} />}
        <nav className={`nav ${open ? 'open' : ''}`}>
          {GROUPS.map((g) => (
            <div key={g.group} style={{ display: 'contents' }}>
              <div className="nav-group">{t(g.group)}</div>
              {g.links.map((l) => {
                const on = l.href === '/' ? path === '/' : path.startsWith(l.href);
                const n = l.badge && counts ? counts[l.badge] : 0;
                return (
                  <Link key={l.href} href={l.href} className={`nav-link ${on ? 'on' : ''}`}>
                    <span>{t(l.key)}</span>
                    {n > 0 && <span className={`count-pill ${l.tone}`}>{n}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="nav-user">
            <Avatar name={me.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ellipsis" style={{ fontSize: 12, fontWeight: 500 }}>{me.name}</div>
              <div className="mono xsmall t-subtle">{t(`role.${me.role}`)}</div>
            </div>
            <Button variant="link" onClick={signOut}>{t('common.signOut')}</Button>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
