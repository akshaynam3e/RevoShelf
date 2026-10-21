import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS, LISTING_STATUSES, MAX_IMAGES_PER_LISTING, MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME,
  canSellerTransition, type CampusDTO, type Category, type Condition, type ListingDTO, type ListingStatus, type Page, type PublicSeller,
} from '@revoshelf/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, CardSkeletons, Empty, ErrorBox, ListingCard, Notice, ReportDialog, Spinner, StatusBadge, VerifiedBadge, useToggleFavorite } from '../components/ui';
import { ago, api, errMsg, inr } from '../lib/api';
import { useAuth } from '../lib/auth';

/* ---------------- Marketplace ---------------- */
export function Marketplace() {
  const { me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const campus = sp.get('campus') ?? (me?.campusId ?? 'all'); // default: the user's own campus
  const [q, setQ] = useState(get('q'));
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  useEffect(() => { const t = setTimeout(() => { if (q !== get('q')) set('q', q.trim()); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ['q', 'category', 'condition', 'minPrice', 'maxPrice']) if (sp.get(k)) p.set(k, sp.get(k)!);
    if (campus !== 'all') p.set('campusId', campus);
    p.set('sort', sp.get('sort') ?? 'newest');
    p.set('pageSize', '20');
    return p;
  }, [sp, campus]);

  const query = useInfiniteQuery({
    queryKey: ['listings', params.toString(), me?.id],
    queryFn: ({ pageParam }) => api<Page<ListingDTO>>(`/listings?${params}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const colleges = useQuery({ queryKey: ['colleges'], queryFn: () => api<{ id: string; name: string; campuses: { id: string; name: string }[] }[]>('/colleges'), staleTime: 300_000 });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const campusName = colleges.data?.flatMap((c) => c.campuses.map((p) => ({ id: p.id, label: `${c.name} – ${p.name}` })));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Marketplace</h1>
      <div className="card space-y-3 p-3 sm:p-4">
        <input type="search" className="input" placeholder="Search titles and descriptions…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <select className="input" aria-label="Campus" value={campus} onChange={(e) => set('campus', e.target.value)}><option value="all">All campuses</option>{campusName?.map((c) => <option key={c.id} value={c.id}>{c.label}{c.id === me?.campusId ? ' (yours)' : ''}</option>)}</select>
          <select className="input" aria-label="Category" value={get('category')} onChange={(e) => set('category', e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select>
          <select className="input" aria-label="Condition" value={get('condition')} onChange={(e) => set('condition', e.target.value)}><option value="">Any condition</option>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}</select>
          <select className="input" aria-label="Sort" value={get('sort') || 'newest'} onChange={(e) => set('sort', e.target.value)}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
          <input className="input" type="number" min={0} inputMode="numeric" placeholder="Min ₹" aria-label="Minimum price" value={get('minPrice')} onChange={(e) => set('minPrice', e.target.value)} />
          <input className="input" type="number" min={0} inputMode="numeric" placeholder="Max ₹" aria-label="Maximum price" value={get('maxPrice')} onChange={(e) => set('maxPrice', e.target.value)} />
        </div>
      </div>
      {query.isLoading ? <CardSkeletons /> : query.isError ? <ErrorBox error={query.error} retry={() => query.refetch()} /> : items.length === 0 ? (
        <Empty title="No listings found" hint="Try different filters, or browse all campuses." action={<Link className="btn-primary mt-2" to="/listings/new">List an item</Link>} />
      ) : (
        <>
          <p className="text-sm text-slate-500" aria-live="polite">{total} item{total === 1 ? '' : 's'}</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          {query.hasNextPage && <div className="text-center"><button className="btn-secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</button></div>}
        </>
      )}
    </div>
  );
}

/* ---------------- Listing detail ---------------- */
export function ListingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me, session } = useAuth();
  const { toggle } = useToggleFavorite();
  const [img, setImg] = useState(0);
  const [report, setReport] = useState(false);
  const q = useQuery({ queryKey: ['listing', id, me?.id], queryFn: () => api<ListingDTO>(`/listings/${id}`) });
  const chat = useMutation({ mutationFn: () => api<{ id: string }>('/conversations', { method: 'POST', body: { listingId: id } }), onSuccess: (r) => nav(`/messages/${r.id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const l = q.data!;
  const own = me?.id === l.sellerId;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <div className="card aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">{l.images[img] ? <img src={l.images[img].url} alt={l.title} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-6xl">📦</div>}</div>
        {l.images.length > 1 && <div className="flex gap-2 overflow-x-auto">{l.images.map((im, i) => <button key={im.id} aria-label={`Show photo ${i + 1}`} onClick={() => setImg(i)} className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === img ? 'border-brand-600' : 'border-transparent'}`}><img src={im.url} alt="" className="h-full w-full object-cover" /></button>)}</div>}
      </div>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2"><h1 className="text-2xl font-extrabold">{l.title}</h1><StatusBadge status={l.status} /></div>
        <p className="text-3xl font-extrabold text-brand-700 dark:text-indigo-300">{inr(l.priceInr)}</p>
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-200 px-2 py-1 dark:bg-slate-800">{CATEGORY_LABELS[l.category]}</span><span className="rounded-full bg-slate-200 px-2 py-1 dark:bg-slate-800">{CONDITION_LABELS[l.condition]}</span><span className="rounded-full bg-brand-50 px-2 py-1 text-brand-700 dark:bg-indigo-950 dark:text-indigo-200">📍 {l.campus.name}, {l.campus.collegeName}</span></div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{l.description}</p>
        <p className="text-xs text-slate-500">Posted {ago(l.createdAt)}</p>
        <Link to={`/u/${l.seller.id}`} className="card flex items-center gap-3 p-3"><Avatar name={l.seller.displayName} url={l.seller.avatarUrl} /><div><p className="font-semibold">{l.seller.displayName}</p>{l.seller.studentStatus === 'verified' && <VerifiedBadge />}</div></Link>
        {own ? (
          <div className="flex gap-2"><Link className="btn-primary flex-1" to={`/listings/${l.id}/edit`}>Edit listing</Link><Link className="btn-secondary flex-1" to="/my-listings">Manage</Link></div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              {['active', 'reserved'].includes(l.status) && <button className="btn-primary flex-1" disabled={chat.isPending} onClick={() => (session ? chat.mutate() : nav(`/login?next=/listings/${l.id}`))}>{chat.isPending ? 'Opening…' : '💬 Message seller'}</button>}
              <button className="btn-secondary" aria-pressed={!!l.favorited} onClick={() => toggle(l)}>{l.favorited ? '❤️ Saved' : '🤍 Save'}</button>
            </div>
            {chat.isError && <Notice kind="error">{errMsg(chat.error)}</Notice>}
            {session && <button className="text-sm text-slate-500 underline" onClick={() => setReport(true)}>🚩 Report this listing</button>}
            <Notice>Meet in a public campus spot and inspect the item before paying. RevoShelf never handles payments. <Link className="underline" to="/safety">Safety tips</Link></Notice>
          </div>
        )}
      </div>
      {report && <ReportDialog targetType="listing" targetId={l.id} onClose={() => setReport(false)} />}
    </div>
  );
}

/* ---------------- Create / edit ---------------- */
export function ListingForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const existing = useQuery({ queryKey: ['listing', id, me?.id], queryFn: () => api<ListingDTO>(`/listings/${id}`), enabled: editing });
  const [f, setF] = useState({ title: '', description: '', price: '', category: 'textbooks' as Category, condition: 'good' as Condition });
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const l = existing.data; if (l && !loaded) { setF({ title: l.title, description: l.description, price: String(l.priceInr), category: l.category, condition: l.condition }); setLoaded(true); } }, [existing.data, loaded]);
  const previews = useMemo(() => files.map((x) => URL.createObjectURL(x)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  const have = existing.data?.images.length ?? 0;

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    setFileErr('');
    for (const file of Array.from(list)) {
      if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) { setFileErr('Only JPEG, PNG or WebP images are allowed.'); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setFileErr('Each image must be 5 MB or smaller.'); continue; }
      if (have + next.length >= MAX_IMAGES_PER_LISTING) { setFileErr(`Maximum ${MAX_IMAGES_PER_LISTING} images per listing.`); break; }
      next.push(file);
    }
    setFiles(next);
  };
  const removeImg = useMutation({ mutationFn: (imgId: string) => api(`/listings/${id}/images/${imgId}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['listing', id] }) });
  const save = useMutation({
    mutationFn: async () => {
      const body = { title: f.title.trim(), description: f.description.trim(), priceInr: Math.round(Number(f.price)), category: f.category, condition: f.condition };
      const listing = editing ? await api<ListingDTO>(`/listings/${id}`, { method: 'PATCH', body }) : await api<ListingDTO>('/listings', { method: 'POST', body });
      if (files.length) {
        const fd = new FormData();
        files.forEach((x) => fd.append('files', x));
        try { await api(`/listings/${listing.id}/images`, { method: 'POST', form: fd }); }
        catch (e) { throw new Error(`Listing saved, but photos failed to upload: ${errMsg(e)}. Open the listing and use Edit to retry.`); }
      }
      return listing;
    },
    onSuccess: (l) => { qc.invalidateQueries({ queryKey: ['listings'] }); qc.invalidateQueries({ queryKey: ['me-listings'] }); qc.invalidateQueries({ queryKey: ['listing'] }); nav(`/listings/${l.id}`); },
  });
  if (editing && existing.isLoading) return <Spinner />;
  if (editing && existing.isError) return <ErrorBox error={existing.error} />;
  return (
    <form className="mx-auto max-w-xl space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h1 className="text-2xl font-extrabold">{editing ? 'Edit listing' : 'Sell an item'}</h1>
      <div><label className="label" htmlFor="t">Title</label><input id="t" className="input" required minLength={3} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div><label className="label" htmlFor="d">Description</label><textarea id="d" className="input" rows={5} required minLength={10} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /><p className="mt-1 text-right text-xs text-slate-400">{f.description.length}/2000</p></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="p">Price (₹)</label><input id="p" className="input" type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        <div><label className="label" htmlFor="c">Category</label><select id="c" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></div>
        <div className="col-span-2"><label className="label" htmlFor="co">Condition</label><select id="co" className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as Condition })}>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}</select></div>
      </div>
      <div>
        <label className="label">Photos ({have + files.length}/{MAX_IMAGES_PER_LISTING})</label>
        <div className="flex flex-wrap gap-2">
          {existing.data?.images.map((im) => <div key={im.id} className="relative h-20 w-20"><img src={im.url} alt="" className="h-full w-full rounded-lg object-cover" /><button type="button" aria-label="Delete photo" className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-red-600 text-xs text-white" disabled={removeImg.isPending} onClick={() => removeImg.mutate(im.id)}>✕</button></div>)}
          {previews.map((u, i) => <div key={u} className="relative h-20 w-20"><img src={u} alt="" className="h-full w-full rounded-lg object-cover" /><button type="button" aria-label="Remove photo" className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-slate-700 text-xs text-white" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}
          {have + files.length < MAX_IMAGES_PER_LISTING && <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-400 dark:border-slate-700"><span aria-hidden>＋</span><span className="sr-only">Add photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} /></label>}
        </div>
        {fileErr && <p className="mt-1 text-sm text-red-600" role="alert">{fileErr}</p>}
      </div>
      {save.isError && <Notice kind="error">{errMsg(save.error)}</Notice>}
      <button className="btn-primary w-full" disabled={save.isPending || !!needsVerify}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}</button>
    </form>
  );
}

/* ---------------- Saved ---------------- */
export function Saved() {
  const q = useQuery({ queryKey: ['favorites'], queryFn: () => api<ListingDTO[]>('/favorites') });
  return (
    <div className="space-y-4"><h1 className="text-2xl font-extrabold">Saved items</h1>
      {q.isLoading ? <CardSkeletons n={4} /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : q.data!.length === 0 ? <Empty title="Nothing saved yet" hint="Tap the heart on any listing to keep it here." action={<Link className="btn-primary mt-2" to="/marketplace">Browse listings</Link>} /> : <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{q.data!.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
    </div>
  );
}

/* ---------------- My listings ---------------- */
export function MyListings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ListingStatus | 'all'>('all');
  const q = useQuery({ queryKey: ['me-listings'], queryFn: () => api<ListingDTO[]>('/me/listings') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['me-listings'] }); qc.invalidateQueries({ queryKey: ['listings'] }); };
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: ListingStatus }) => api(`/listings/${id}/status`, { method: 'POST', body: { status } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api(`/listings/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const rows = (q.data ?? []).filter((l) => tab === 'all' || l.status === tab);
  const actions: [ListingStatus, string][] = [['active', 'Mark active'], ['reserved', 'Reserve'], ['sold', 'Mark sold'], ['archived', 'Archive']];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">My listings</h1><Link to="/listings/new" className="btn-primary">+ New</Link></div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">{(['all', ...LISTING_STATUSES] as const).map((s) => <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`btn !min-h-[36px] shrink-0 capitalize ${tab === s ? 'bg-brand-600 text-white' : 'btn-secondary'}`}>{s}</button>)}</div>
      {(setStatus.isError || del.isError) && <Notice kind="error">{errMsg(setStatus.error ?? del.error)}</Notice>}
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : rows.length === 0 ? <Empty title="No listings here" action={<Link to="/listings/new" className="btn-primary mt-2">Create a listing</Link>} /> : (
        <ul className="space-y-3">{rows.map((l) => (
          <li key={l.id} className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <Link to={`/listings/${l.id}`} className="flex min-w-0 flex-1 items-center gap-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">{l.images[0] && <img src={l.images[0].url} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="truncate font-semibold">{l.title}</p><p className="text-sm text-slate-500">{inr(l.priceInr)} · <StatusBadge status={l.status} /></p></div></Link>
            <div className="flex flex-wrap gap-2">
              {l.status !== 'removed' && <Link className="btn-secondary !min-h-[36px]" to={`/listings/${l.id}/edit`}>Edit</Link>}
              {actions.filter(([s]) => canSellerTransition(l.status, s)).map(([s, label]) => <button key={s} className="btn-secondary !min-h-[36px]" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: l.id, status: s })}>{label}</button>)}
              {l.status !== 'removed' && <button className="btn-danger !min-h-[36px]" disabled={del.isPending} onClick={() => confirm('Delete this listing permanently?') && del.mutate(l.id)}>Delete</button>}
            </div>
            {l.status === 'removed' && <p className="text-xs text-red-600">Removed by a moderator.</p>}
          </li>))}</ul>
      )}
    </div>
  );
}

/* ---------------- Seller profile ---------------- */
export function SellerProfile() {
  const { id } = useParams();
  const { session, me } = useAuth();
  const [report, setReport] = useState(false);
  const q = useQuery({ queryKey: ['user', id], queryFn: () => api<{ user: PublicSeller & { campus: CampusDTO | null }; listings: ListingDTO[] }>(`/users/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const { user, listings } = q.data!;
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <Avatar name={user.displayName} url={user.avatarUrl} size={72} />
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-extrabold">{user.displayName}</h1>{user.studentStatus === 'verified' && <VerifiedBadge />}<p className="text-sm text-slate-500">{user.campus ? `${user.campus.name}, ${user.campus.collegeName} · ` : ''}Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p></div>
        {session && me?.id !== user.id && <button className="btn-secondary" onClick={() => setReport(true)}>🚩 Report</button>}
      </div>
      <h2 className="text-lg font-bold">Active listings ({listings.length})</h2>
      {listings.length === 0 ? <Empty title="No active listings" /> : <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
      {report && <ReportDialog targetType="user" targetId={user.id} onClose={() => setReport(false)} />}
    </div>
  );
}
