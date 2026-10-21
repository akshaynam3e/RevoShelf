import { useQuery } from '@tanstack/react-query';
import type { ConversationDTO } from '@revoshelf/shared';
import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { firebaseConfigError } from '../lib/firebase';
import { Avatar, Spinner } from './ui';

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* storage may be unavailable */ }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function useUnread() {
  const { session } = useAuth();
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api<ConversationDTO[]>('/conversations'), enabled: !!session, refetchInterval: 30_000 });
  return (q.data ?? []).reduce((n, c) => n + c.unreadCount, 0);
}

export function Layout() {
  const { session, me, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const unread = useUnread();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  const link = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-indigo-950 dark:text-indigo-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`;
  const tab = ({ isActive }: { isActive: boolean }) => `relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`;
  return (
    <div className="flex min-h-screen flex-col">
      {firebaseConfigError && <div role="alert" className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">Firebase authentication is not configured yet. Add the VITE_FIREBASE_* environment variables before deploying.</div>}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Link to="/" className="mr-2 text-xl font-extrabold tracking-tight text-brand-600">Revo<span className="text-slate-900 dark:text-white">Shelf</span></Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            <NavLink to="/marketplace" className={link}>Marketplace</NavLink>
            <NavLink to="/safety" className={link}>Safety</NavLink>
            {session && <><NavLink to="/saved" className={link}>Saved</NavLink><NavLink to="/messages" className={link}>Messages{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}</NavLink><NavLink to="/my-listings" className={link}>My listings</NavLink></>}
            {me?.role === 'admin' && <NavLink to="/admin" className={link}>Admin</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-secondary !min-h-[40px] !px-3" onClick={toggle} aria-label="Toggle dark mode">{dark ? '☀️' : '🌙'}</button>
            {session ? (
              <>
                <Link to="/listings/new" className="btn-primary hidden !min-h-[40px] sm:inline-flex">+ Sell</Link>
                <div className="relative">
                  <button aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Avatar name={me?.displayName ?? '?'} url={me?.avatarUrl ?? null} size={40} /></button>
                  {menu && (
                    <div className="card absolute right-0 mt-2 w-52 p-1 text-sm shadow-lg">
                      <p className="truncate px-3 py-2 font-semibold">{me?.displayName}</p>
                      {[['/settings', 'Profile & settings'], ['/my-listings', 'My listings'], ['/saved', 'Saved items'], ['/safety', 'Safety guidelines']].map(([to, t]) => <Link key={to} to={to} className="block rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">{t}</Link>)}
                      <button className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={signOut}>Log out</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link to="/login" className="btn-primary !min-h-[40px]">Log in</Link>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:pb-8"><Outlet /></main>
      <footer className="hidden border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 md:block">RevoShelf does not process payments. Students arrange exchanges independently. · <Link className="underline" to="/safety">Safety</Link></footer>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950 md:hidden">
        <NavLink to="/marketplace" className={tab}><span aria-hidden>🛍️</span>Browse</NavLink>
        <NavLink to="/saved" className={tab}><span aria-hidden>❤️</span>Saved</NavLink>
        <NavLink to="/listings/new" className={tab}><span aria-hidden className="-mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xl text-white">+</span>Sell</NavLink>
        <NavLink to="/messages" className={tab}><span aria-hidden>💬</span>Chats{unread > 0 && <span className="absolute right-4 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread}</span>}</NavLink>
        <NavLink to={session ? '/settings' : '/login'} className={tab}><span aria-hidden>👤</span>{session ? 'Me' : 'Log in'}</NavLink>
      </nav>
    </div>
  );
}

export function ProtectedRoute({ admin = false }: { admin?: boolean; allowIncomplete?: boolean }) {
  const { session, me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me?.suspended) return <div className="card mx-auto max-w-md p-6 text-center"><h1 className="text-xl font-bold">Account suspended</h1><p className="mt-2 text-sm text-slate-500">Your account has been suspended by a moderator. Contact your campus administrator if you believe this is a mistake.</p></div>;
  if (admin && me?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
