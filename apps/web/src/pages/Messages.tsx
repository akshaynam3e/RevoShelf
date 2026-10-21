import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationDTO, MessageDTO } from '@revoshelf/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Empty, ErrorBox, Notice, Skeleton, StatusBadge } from '../components/ui';
import { ago, api, errMsg, inr } from '../lib/api';
import { useAuth } from '../lib/auth';

function ConversationList({ activeId }: { activeId?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api<ConversationDTO[]>('/conversations'), refetchInterval: 30_000 });
  if (q.isLoading) return <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (q.isError) return <div className="p-3"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data!.length) return <div className="p-3"><Empty title="No conversations yet" hint="Open a listing and tap “Message seller” to start chatting." action={<Link to="/marketplace" className="btn-primary mt-2">Browse listings</Link>} /></div>;
  return (
    <ul>{q.data!.map((c) => (
      <li key={c.id}><Link to={`/messages/${c.id}`} className={`flex gap-3 border-b border-slate-100 p-3 dark:border-slate-800 ${c.id === activeId ? 'bg-brand-50 dark:bg-indigo-950' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
        <Avatar name={c.other.displayName} url={c.other.avatarUrl} />
        <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate font-semibold">{c.other.displayName}</p><span className="shrink-0 text-xs text-slate-400">{ago(c.lastMessageAt)}</span></div><p className="truncate text-xs text-slate-500">{c.listing.title}</p><p className={`truncate text-sm ${c.unreadCount ? 'font-semibold' : 'text-slate-500'}`}>{c.lastMessage ?? 'No messages yet'}</p></div>
        {c.unreadCount > 0 && <span className="self-center rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white" aria-label={`${c.unreadCount} unread`}>{c.unreadCount}</span>}
      </Link></li>))}</ul>
  );
}

function Chat({ id }: { id: string }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<MessageDTO[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api<ConversationDTO>(`/conversations/${id}`) });
  const history = useQuery({ queryKey: ['messages', id], queryFn: () => api<MessageDTO[]>(`/conversations/${id}/messages`), gcTime: 0 });
  const markRead = () => api(`/conversations/${id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['conversations'] })).catch(() => {});

  useEffect(() => { if (history.data) { setMsgs(history.data); markRead(); } }, [history.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMsgs([]); }, [id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const send = useMutation({
    mutationFn: (body: string) => api<MessageDTO>(`/conversations/${id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: (m) => { setText(''); setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])); qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
  if (conv.isError) return <div className="p-4"><ErrorBox error={conv.error} /></div>;
  const c = conv.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 p-3 dark:border-slate-800">
        <Link to="/messages" className="btn-secondary !min-h-[36px] !px-3 md:hidden" aria-label="Back to conversations">←</Link>
        {c ? <><Avatar name={c.other.displayName} url={c.other.avatarUrl} size={36} /><Link to={`/listings/${c.listing.id}`} className="min-w-0 flex-1"><p className="truncate font-semibold">{c.other.displayName}</p><p className="truncate text-xs text-slate-500">{c.listing.title} · {inr(c.listing.priceInr)} <StatusBadge status={c.listing.status} /></p></Link></> : <Skeleton className="h-9 w-48" />}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {history.isLoading && <Skeleton className="h-10 w-2/3" />}
        {history.isError && <ErrorBox error={history.error} retry={() => history.refetch()} />}
        {!history.isLoading && msgs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Say hello and agree on a public campus spot to meet.</p>}
        {msgs.map((m) => { const mine = m.senderId === me?.id; return (
          <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>{m.body}<div className={`mt-1 text-[10px] ${mine ? 'text-indigo-200' : 'text-slate-500'}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && m.readAt ? ' · Seen' : ''}</div></div></div>); })}
        <div ref={bottom} />
      </div>
      {send.isError && <div className="px-3"><Notice kind="error">{errMsg(send.error)}</Notice></div>}
      <form className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) send.mutate(t); }}>
        <input className="input" placeholder="Write a message…" aria-label="Message" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary" disabled={send.isPending || !text.trim()}>Send</button>
      </form>
      <p className="px-3 pb-2 text-center text-[11px] text-slate-400">Never share passwords or verification codes. Pay only in person.</p>
    </div>
  );
}

export function Messages() {
  const { id } = useParams();
  return (
    <div className="card grid h-[calc(100dvh-10rem)] min-h-[420px] overflow-hidden md:h-[calc(100vh-9rem)] md:grid-cols-[320px_1fr]">
      <aside className={`${id ? 'hidden md:block' : ''} overflow-y-auto border-r border-slate-200 dark:border-slate-800`}><ConversationList activeId={id} /></aside>
      <section className={`${id ? '' : 'hidden md:flex'} min-h-0 flex-col md:flex`}>{id ? <Chat key={id} id={id} /> : <div className="m-auto p-6 text-center text-slate-500">Select a conversation</div>}</section>
    </div>
  );
}
