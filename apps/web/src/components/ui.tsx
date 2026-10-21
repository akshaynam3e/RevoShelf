import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CONDITION_LABELS, REPORT_REASONS, REPORT_REASON_LABELS, type ListingDTO, type ListingStatus, type ReportReason } from '@revoshelf/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ago, api, errMsg, inr } from '../lib/api';
import { useAuth } from '../lib/auth';

export const Spinner = () => (
  <div role="status" aria-label="Loading" className="flex justify-center py-12">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
  </div>
);
export const Skeleton = ({ className = '' }: { className?: string }) => <div className={`animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800 ${className}`} />;
export const CardSkeletons = ({ n = 8 }: { n?: number }) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="card overflow-hidden"><Skeleton className="aspect-square rounded-none" /><div className="space-y-2 p-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/3" /></div></div>
    ))}
  </div>
);
export const ErrorBox = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div role="alert" className="card border-red-200 p-4 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
    {errMsg(error)}
    {retry && <button className="btn-secondary ml-3 !min-h-[36px]" onClick={retry}>Retry</button>}
  </div>
);
export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
    <div className="text-4xl" aria-hidden>📚</div>
    <h2 className="text-lg font-semibold">{title}</h2>
    {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
    {action}
  </div>
);
export const Notice = ({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) => {
  const c = { info: 'bg-brand-50 text-brand-700 dark:bg-indigo-950 dark:text-indigo-200', error: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200', success: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${c}`}>{children}</div>;
};

const STATUS_STYLE: Record<ListingStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  reserved: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  sold: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  archived: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  removed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};
export const StatusBadge = ({ status }: { status: ListingStatus }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>
);
export const VerifiedBadge = () => <span title="Verified student" className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-indigo-950 dark:text-indigo-200">✓ Verified student</span>;

export function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const s = { width: size, height: size };
  return url ? (
    <img src={url} alt="" style={s} className="shrink-0 rounded-full object-cover" loading="lazy" />
  ) : (
    <span style={s} className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
  );
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api(`/favorites/${id}`, { method: on ? 'PUT' : 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['listing'] });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
  return { toggle: (l: ListingDTO) => (session ? m.mutate({ id: l.id, on: !l.favorited }) : nav('/login?next=' + encodeURIComponent(location.pathname + location.search))), pending: m.isPending };
}

export function ListingCard({ l }: { l: ListingDTO }) {
  const { toggle, pending } = useToggleFavorite();
  const { session } = useAuth();
  return (
    <article className="card group relative animate-fadeIn overflow-hidden">
      <Link to={`/listings/${l.id}`} className="block">
        <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
          {l.images[0] ? <img src={l.images[0].url} alt={l.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl" aria-hidden>📦</div>}
          {l.status !== 'active' && <div className="absolute left-2 top-2"><StatusBadge status={l.status} /></div>}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold">{l.title}</h3>
          <p className="text-base font-bold text-brand-700 dark:text-indigo-300">{inr(l.priceInr)}</p>
          <p className="truncate text-xs text-slate-500">{CONDITION_LABELS[l.condition]} · {l.campus.name}, {l.campus.collegeName}</p>
          <p className="text-xs text-slate-400">{ago(l.createdAt)}</p>
        </div>
      </Link>
      {(session || l.favorited === undefined) && (
        <button aria-label={l.favorited ? 'Remove from saved' : 'Save listing'} aria-pressed={!!l.favorited} disabled={pending} onClick={() => toggle(l)} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg shadow dark:bg-slate-900/90">
          {l.favorited ? '❤️' : '🤍'}
        </button>
      )}
    </article>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="card max-h-[90vh] w-full max-w-md animate-fadeIn overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button aria-label="Close" className="btn-secondary !min-h-[36px] !px-3" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function ReportDialog({ targetType, targetId, onClose }: { targetType: 'listing' | 'user'; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('scam');
  const [description, setDescription] = useState('');
  const m = useMutation({ mutationFn: () => api('/reports', { method: 'POST', body: { targetType, targetId, reason, ...(description.trim() ? { description: description.trim() } : {}) } }) });
  return (
    <Modal title={`Report ${targetType}`} onClose={onClose}>
      {m.isSuccess ? (
        <div className="space-y-3"><Notice kind="success">Thanks. Our moderators will review your report.</Notice><button className="btn-primary w-full" onClick={onClose}>Done</button></div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div><label className="label" htmlFor="reason">Reason</label>
            <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>{REPORT_REASONS.map((r) => <option key={r} value={r}>{REPORT_REASON_LABELS[r]}</option>)}</select></div>
          <div><label className="label" htmlFor="desc">Details (optional)</label>
            <textarea id="desc" className="input" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {m.isError && <Notice kind="error">{errMsg(m.error)}</Notice>}
          <button className="btn-primary w-full" disabled={m.isPending}>{m.isPending ? 'Sending…' : 'Submit report'}</button>
        </form>
      )}
    </Modal>
  );
}
