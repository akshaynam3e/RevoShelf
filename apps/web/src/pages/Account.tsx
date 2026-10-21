import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CollegeDTO } from '@revoshelf/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, Notice, Spinner, VerifiedBadge } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';

export function CampusPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const q = useQuery({ queryKey: ['colleges'], queryFn: () => api<CollegeDTO[]>('/colleges'), staleTime: 300_000 });
  if (q.isLoading) return <p className="text-sm text-slate-500">Loading colleges…</p>;
  if (q.isError) return <Notice kind="error">{errMsg(q.error)}</Notice>;
  return (
    <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} required aria-label="College and campus">
      <option value="">Select your college & campus</option>
      {q.data!.map((c) => <optgroup key={c.id} label={c.name}>{c.campuses.map((p) => <option key={p.id} value={p.id}>{c.name} – {p.name}{p.city ? `, ${p.city}` : ''}</option>)}</optgroup>)}
    </select>
  );
}

export function Settings() {
  const { me, session } = useAuth();
  const qc = useQueryClient();
  const loc = useLocation();
  const [name, setName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [year, setYear] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (me) { setName(me.displayName); setCampusId(me.campusId ?? ''); setYear(me.academicYear ? String(me.academicYear) : ''); } }, [me]);
  const save = useMutation({
    mutationFn: () => api('/me', { method: 'PATCH', body: { displayName: name.trim(), academicYear: year ? Number(year) : null, ...(campusId && campusId !== me?.campusId ? { campusId } : {}) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const avatar = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append('file', f); return api('/me/avatar', { method: 'POST', form: fd }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  if (!me) return <Spinner />;
  const locked = !['unverified', 'rejected'].includes(me.studentStatus);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold">Profile & settings</h1>
      {(loc.state as { incomplete?: boolean } | null)?.incomplete && <Notice>Choose your campus to finish setting up your profile.</Notice>}
      <div className="card flex items-center gap-4 p-4">
        <Avatar name={me.displayName} url={me.avatarUrl} size={64} />
        <div className="min-w-0"><p className="truncate font-bold">{me.displayName}</p><p className="truncate text-sm text-slate-500">{me.email}</p>{me.studentStatus === 'verified' ? <VerifiedBadge /> : <Link to="/verify" className="text-sm text-brand-600 underline">Verify as a student</Link>}</div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.mutate(f); e.target.value = ''; }} />
        <button className="btn-secondary ml-auto" disabled={avatar.isPending} onClick={() => fileRef.current?.click()}>{avatar.isPending ? 'Uploading…' : 'Change photo'}</button>
      </div>
      {avatar.isError && <Notice kind="error">{errMsg(avatar.error)}</Notice>}
      <form className="card space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div><label className="label" htmlFor="dn">Display name</label><input id="dn" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">College & campus</label><CampusPicker value={campusId} onChange={setCampusId} disabled={locked} />{locked && <p className="mt-1 text-xs text-slate-500">Locked once verification has started.</p>}</div>
        <div><label className="label" htmlFor="yr">Academic year (optional)</label><select id="yr" className="input" value={year} onChange={(e) => setYear(e.target.value)}><option value="">Prefer not to say</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</select></div>
        {save.isError && <Notice kind="error">{errMsg(save.error)}</Notice>}
        {save.isSuccess && <Notice kind="success">Saved.</Notice>}
        <button className="btn-primary w-full" disabled={save.isPending || !campusId}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
      </form>
      {session && <p className="text-center text-xs text-slate-400">Member since {new Date(me.createdAt).toLocaleDateString()}</p>}
    </div>
  );
}

export function Verify() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [campusId, setCampusId] = useState('');
  const [evidence, setEvidence] = useState('');
  useEffect(() => { if (me?.campusId) setCampusId(me.campusId); }, [me?.campusId]);
  const done = () => qc.invalidateQueries({ queryKey: ['me'] });
  const byEmail = useMutation({ mutationFn: () => api('/verification/email', { method: 'POST', body: { campusId } }), onSuccess: done });
  const manual = useMutation({ mutationFn: () => api('/verification/manual', { method: 'POST', body: { campusId, evidence: evidence.trim() } }), onSuccess: done });
  if (!me) return <Spinner />;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold">Student verification</h1>
      <div className="card space-y-1 p-4 text-sm">
        <p>Email: <b>{me.email}</b> {me.emailVerified ? <span className="text-green-600">✓ confirmed</span> : <span className="text-amber-600">not confirmed yet</span>}</p>
        <p>Student status: <b className="capitalize">{me.studentStatus}</b></p>
      </div>
      {me.studentStatus === 'verified' && <Notice kind="success">You're a verified student. You can list items and message sellers. <Link className="underline" to="/listings/new">Sell something</Link></Notice>}
      {me.studentStatus === 'pending' && <Notice>Your manual verification request is awaiting review by an administrator.</Notice>}
      {['unverified', 'rejected'].includes(me.studentStatus) && (
        <>
          {me.studentStatus === 'rejected' && <Notice kind="error">Your previous request was rejected. You can try again below.</Notice>}
          <div className="card space-y-3 p-4">
            <label className="label">College & campus</label>
            <CampusPicker value={campusId} onChange={setCampusId} />
            <h2 className="pt-2 font-bold">Option 1: Verify with your college email</h2>
            <p className="text-sm text-slate-500">Works if you signed up with an email on your college's approved domain, and you've confirmed that email.</p>
            {byEmail.isError && <Notice kind="error">{errMsg(byEmail.error)}</Notice>}
            <button className="btn-primary w-full" disabled={!campusId || byEmail.isPending} onClick={() => byEmail.mutate()}>{byEmail.isPending ? 'Checking…' : 'Verify my email'}</button>
          </div>
          <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); manual.mutate(); }}>
            <h2 className="font-bold">Option 2: Request manual verification</h2>
            <p className="text-sm text-slate-500">For colleges we don't support yet. Tell us how an administrator can confirm you're a student (e.g. your enrollment number and course). Do not upload or paste ID card numbers.</p>
            <textarea className="input" rows={4} required minLength={10} maxLength={500} value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-label="Verification details" />
            {manual.isError && <Notice kind="error">{errMsg(manual.error)}</Notice>}
            <button className="btn-secondary w-full" disabled={!campusId || manual.isPending}>{manual.isPending ? 'Submitting…' : 'Submit request'}</button>
          </form>
        </>
      )}
    </div>
  );
}
