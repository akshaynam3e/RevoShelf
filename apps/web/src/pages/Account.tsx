import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Notice, Spinner } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Settings() {
  const { me, session } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (me) {
      setName(me.displayName);
      setYear(me.academicYear ? String(me.academicYear) : '');
    }
  }, [me]);

  const save = useMutation({
    mutationFn: () => api('/me', {
      method: 'PATCH',
      body: {
        displayName: name.trim(),
        academicYear: year ? Number(year) : null,
      },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const avatar = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return api('/me/avatar', { method: 'POST', form: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  if (!me) return <Spinner />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold">Profile & settings</h1>

      <div className="card flex items-center gap-4 p-4">
        <Avatar name={me.displayName} url={me.avatarUrl} size={64} />
        <div className="min-w-0">
          <p className="truncate font-bold">{me.displayName}</p>
          <p className="truncate text-sm text-slate-500">{me.email}</p>
          <p className="text-sm text-green-600">Verified member</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) avatar.mutate(f);
            e.target.value = '';
          }}
        />
        <button
          className="btn-secondary ml-auto"
          disabled={avatar.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {avatar.isPending ? 'Uploading…' : 'Change photo'}
        </button>
      </div>

      {avatar.isError && <Notice kind="error">{errMsg(avatar.error)}</Notice>}

      <form
        className="card space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="dn">Display name</label>
          <input
            id="dn"
            className="input"
            required
            minLength={2}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="yr">Academic year (optional)</label>
          <select id="yr" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Prefer not to say</option>
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <option key={y} value={y}>Year {y}</option>
            ))}
          </select>
        </div>

        {save.isError && <Notice kind="error">{errMsg(save.error)}</Notice>}
        {save.isSuccess && <Notice kind="success">Saved.</Notice>}

        <button className="btn-primary w-full" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {session && (
        <p className="text-center text-xs text-slate-400">
          Member since {new Date(me.createdAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export function Verify() {
  return (
    <div className="mx-auto max-w-lg">
      <Notice kind="success">
        Student verification is not required. Everyone can buy, sell and message openly.
      </Notice>
    </div>
  );
}
