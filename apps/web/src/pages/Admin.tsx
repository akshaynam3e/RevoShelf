import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORT_REASON_LABELS, type CollegeDTO, type ListingDTO, type ReportReason } from '@revoshelf/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorBox, Notice, Spinner, StatusBadge } from '../components/ui';
import { ago, api, errMsg } from '../lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS = ['Reports', 'Verifications', 'Listings', 'Suspended', 'History', 'Directory'] as const;
type Tab = (typeof TABS)[number];

function useAdminAction(invalidate: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body, method = 'POST' }: { path: string; body?: unknown; method?: string }) => api(`/admin${path}`, { method, body: body ?? {} }),
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: ['admin', k] })),
  });
}
function List<T>({ q, empty, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; data?: T[]; refetch: () => unknown }; empty: string; children: (rows: T[]) => ReactNode }) {
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  return q.data!.length ? <ul className="space-y-3">{children(q.data!)}</ul> : <Empty title={empty} />;
}

function Reports() {
  const [status, setStatus] = useState('open');
  const q = useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api<any[]>(`/admin/reports?status=${status}`) });
  const act = useAdminAction(['reports', 'listings', 'suspended', 'actions']);
  const ask = (msg: string, min = 0) => { const n = prompt(msg); if (n === null) return null; if (n.trim().length < min) { alert(`Please enter at least ${min} characters.`); return null; } return n.trim(); };
  return (
    <div className="space-y-3">
      <select className="input !w-auto" aria-label="Report status" value={status} onChange={(e) => setStatus(e.target.value)}>{['open', 'dismissed', 'actioned', 'all'].map((s) => <option key={s}>{s}</option>)}</select>
      {act.isError && <Notice kind="error">{errMsg(act.error)}</Notice>}
      <List q={q} empty="No reports">{(rows) => rows.map((r) => {
        const sellerId = r.listing?.seller?.id; const userId = r.reported_user?.id ?? sellerId;
        return (
          <li key={r.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{REPORT_REASON_LABELS[r.reason as ReportReason]}</b><span className="text-xs text-slate-500">{ago(r.created_at)} · by {r.reporter?.display_name} · {r.status}</span></div>
            {r.listing && <p className="text-sm">Listing: <Link className="underline" to={`/listings/${r.listing.id}`}>{r.listing.title}</Link> <StatusBadge status={r.listing.status} /> · seller {r.listing.seller?.display_name}</p>}
            {r.reported_user && <p className="text-sm">User: <Link className="underline" to={`/u/${r.reported_user.id}`}>{r.reported_user.display_name}</Link>{r.reported_user.suspended && ' (suspended)'}</p>}
            {r.description && <p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">{r.description}</p>}
            {r.status === 'open' && (
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary !min-h-[36px]" disabled={act.isPending} onClick={() => { const n = ask('Dismissal note (optional)'); if (n !== null) act.mutate({ path: `/reports/${r.id}/dismiss`, body: { note: n } }); }}>Dismiss</button>
                {r.listing && r.listing.status !== 'removed' && <button className="btn-danger !min-h-[36px]" disabled={act.isPending} onClick={() => { const n = ask('Reason for removal (optional)'); if (n !== null) act.mutate({ path: `/listings/${r.listing.id}/remove`, body: { note: n, reportId: r.id } }); }}>Remove listing</button>}
                {userId && !(r.reported_user?.suspended || r.listing?.seller?.suspended) && <button className="btn-danger !min-h-[36px]" disabled={act.isPending} onClick={() => { const n = ask('Justification for suspension (min 5 chars). Their active listings will be removed.', 5); if (n) act.mutate({ path: `/users/${userId}/suspend`, body: { note: n, reportId: r.id } }); }}>Suspend {r.reported_user ? 'user' : 'seller'}</button>}
              </div>)}
          </li>); })}</List>
    </div>
  );
}

function Verifications() {
  const q = useQuery({ queryKey: ['admin', 'verifications'], queryFn: () => api<any[]>('/admin/verification-requests') });
  const act = useAdminAction(['verifications', 'actions']);
  return (<div className="space-y-3">{act.isError && <Notice kind="error">{errMsg(act.error)}</Notice>}
    <List q={q} empty="No pending requests">{(rows) => rows.map((r) => (
      <li key={r.id} className="card space-y-2 p-4"><p><b>{r.user?.display_name}</b> → {r.campus?.college?.name} – {r.campus?.name}</p><p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">{r.evidence}</p><p className="text-xs text-slate-500">{ago(r.created_at)}</p>
        <div className="flex gap-2"><button className="btn-primary !min-h-[36px]" disabled={act.isPending} onClick={() => act.mutate({ path: `/verification-requests/${r.id}/approve` })}>Approve</button><button className="btn-danger !min-h-[36px]" disabled={act.isPending} onClick={() => act.mutate({ path: `/verification-requests/${r.id}/reject` })}>Reject</button></div></li>))}</List></div>);
}

function Listings() {
  const [status, setStatus] = useState('removed');
  const q = useQuery({ queryKey: ['admin', 'listings', status], queryFn: () => api<ListingDTO[]>(`/admin/listings?status=${status}`) });
  const act = useAdminAction(['listings', 'actions']);
  return (<div className="space-y-3">
    <select className="input !w-auto" aria-label="Listing status" value={status} onChange={(e) => setStatus(e.target.value)}>{['removed', 'active', 'reserved', 'sold', 'archived'].map((s) => <option key={s}>{s}</option>)}</select>
    {act.isError && <Notice kind="error">{errMsg(act.error)}</Notice>}
    <List q={q} empty={`No ${status} listings`}>{(rows) => rows.map((l) => (
      <li key={l.id} className="card flex flex-wrap items-center justify-between gap-2 p-4"><div className="min-w-0"><Link className="font-semibold underline" to={`/listings/${l.id}`}>{l.title}</Link><p className="text-xs text-slate-500">by {l.seller.displayName} · <StatusBadge status={l.status} /></p></div>
        {l.status === 'removed' ? <button className="btn-primary !min-h-[36px]" disabled={act.isPending} onClick={() => act.mutate({ path: `/listings/${l.id}/restore` })}>Restore</button> : <button className="btn-danger !min-h-[36px]" disabled={act.isPending} onClick={() => { const n = prompt('Reason for removal (optional)'); if (n !== null) act.mutate({ path: `/listings/${l.id}/remove`, body: { note: n.trim() } }); }}>Remove</button>}</li>))}</List></div>);
}

function Suspended() {
  const q = useQuery({ queryKey: ['admin', 'suspended'], queryFn: () => api<any[]>('/admin/users/suspended') });
  const act = useAdminAction(['suspended', 'actions']);
  return (<div className="space-y-3">{act.isError && <Notice kind="error">{errMsg(act.error)}</Notice>}
    <List q={q} empty="No suspended accounts">{(rows) => rows.map((u) => (<li key={u.id} className="card flex items-center justify-between p-4"><Link className="font-semibold underline" to={`/u/${u.id}`}>{u.display_name}</Link><button className="btn-secondary !min-h-[36px]" disabled={act.isPending} onClick={() => act.mutate({ path: `/users/${u.id}/unsuspend` })}>Unsuspend</button></li>))}</List></div>);
}

function History() {
  const q = useQuery({ queryKey: ['admin', 'actions'], queryFn: () => api<any[]>('/admin/actions') });
  return <List q={q} empty="No moderation history yet">{(rows) => rows.map((a) => (<li key={a.id} className="card p-3 text-sm"><b>{String(a.action).replace(/_/g, ' ')}</b> by {a.admin?.display_name ?? 'admin'} · {ago(a.created_at)}{a.note && <p className="text-slate-500">“{a.note}”</p>}</li>))}</List>;
}

function Directory() {
  const qc = useQueryClient();
  const colleges = useQuery({ queryKey: ['colleges'], queryFn: () => api<CollegeDTO[]>('/colleges') });
  const domains = useQuery({ queryKey: ['admin', 'domains'], queryFn: () => api<any[]>('/admin/domains') });
  const [college, setCollege] = useState(''); const [campus, setCampus] = useState(''); const [city, setCity] = useState(''); const [cid, setCid] = useState(''); const [domain, setDomain] = useState(''); const [did, setDid] = useState('');
  const done = () => { qc.invalidateQueries({ queryKey: ['colleges'] }); qc.invalidateQueries({ queryKey: ['admin', 'domains'] }); };
  const m = useMutation({ mutationFn: ({ path, body, method = 'POST' }: { path: string; body?: unknown; method?: string }) => api(`/admin${path}`, { method, body }), onSuccess: done });
  return (
    <div className="space-y-4">
      {m.isError && <Notice kind="error">{errMsg(m.error)}</Notice>}
      <form className="card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ path: '/colleges', body: { name: college } }, { onSuccess: () => setCollege('') }); }}><h3 className="font-bold">Add college</h3><div className="flex gap-2"><input className="input" required minLength={2} placeholder="College name" value={college} onChange={(e) => setCollege(e.target.value)} /><button className="btn-primary">Add</button></div></form>
      <form className="card space-y-2 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ path: '/campuses', body: { collegeId: cid, name: campus, ...(city ? { city } : {}) } }, { onSuccess: () => { setCampus(''); setCity(''); } }); }}><h3 className="font-bold">Add campus</h3><select className="input" required value={cid} onChange={(e) => setCid(e.target.value)}><option value="">College…</option>{colleges.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className="input" required minLength={2} placeholder="Campus name" value={campus} onChange={(e) => setCampus(e.target.value)} /><input className="input" placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} /><button className="btn-primary">Add campus</button></form>
      <div className="card space-y-2 p-4"><h3 className="font-bold">Verified email domains</h3>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ path: '/domains', body: { collegeId: did, domain } }, { onSuccess: () => setDomain('') }); }}><select className="input !w-auto flex-1" required value={did} onChange={(e) => setDid(e.target.value)}><option value="">College…</option>{colleges.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className="input !w-auto flex-1" required placeholder="example.edu" value={domain} onChange={(e) => setDomain(e.target.value)} /><button className="btn-primary">Add</button></form>
        {domains.isLoading ? <Spinner /> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{domains.data?.map((d) => <li key={d.id} className="flex items-center justify-between py-2 text-sm"><span>{d.domain} <span className="text-slate-500">→ {d.college?.name}</span></span><button className="text-red-600 underline" onClick={() => confirm(`Remove ${d.domain}?`) && m.mutate({ path: `/domains/${d.id}`, method: 'DELETE' })}>Remove</button></li>)}</ul>}</div>
    </div>
  );
}

export function Admin() {
  const [tab, setTab] = useState<Tab>('Reports');
  return (
    <div className="space-y-4"><h1 className="text-2xl font-extrabold">Admin dashboard</h1>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn !min-h-[36px] shrink-0 ${tab === t ? 'bg-brand-600 text-white' : 'btn-secondary'}`}>{t}</button>)}</div>
      {tab === 'Reports' && <Reports />}{tab === 'Verifications' && <Verifications />}{tab === 'Listings' && <Listings />}{tab === 'Suspended' && <Suspended />}{tab === 'History' && <History />}{tab === 'Directory' && <Directory />}
    </div>
  );
}
