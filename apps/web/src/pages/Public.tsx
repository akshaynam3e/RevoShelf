import { useMutation } from '@tanstack/react-query';
import { createUserWithEmailAndPassword, GoogleAuthProvider, confirmPasswordReset, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updatePassword, updateProfile } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Notice } from '../components/ui';
import { errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import { firebaseAuth } from '../lib/firebase';

export function Landing() {
  const { session } = useAuth();
  const steps = [['🛒', 'Browse freely', 'Anyone can discover useful items at fair prices.'], ['📸', 'List in a minute', 'Add photos, set an INR price and pick a condition.'], ['💬', 'Chat privately', 'Message on-platform. No phone numbers needed.'], ['🤝', 'Meet safely', 'Inspect the item, then pay in person.']];
  return <div className="space-y-10"><section className="rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-800 px-6 py-12 text-white sm:px-12 sm:py-16"><h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">Buy and sell textbooks, calculators and everyday essentials.</h1><p className="mt-4 max-w-xl text-indigo-100">A simple community marketplace. No payments, no fees and no shipping inside the app.</p><div className="mt-6 flex flex-wrap gap-3"><Link to="/marketplace" className="btn bg-white text-brand-700 hover:bg-indigo-50">Browse listings</Link>{!session && <Link to="/login?mode=register" className="btn border border-white/60 text-white hover:bg-white/10">Create account</Link>}</div></section><section aria-label="How it works" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{steps.map(([i, t, d]) => <div key={t} className="card p-5"><div className="text-3xl" aria-hidden>{i}</div><h2 className="mt-2 font-bold">{t}</h2><p className="mt-1 text-sm text-slate-500">{d}</p></div>)}</section></div>;
}

export function Login() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { session } = useAuth();
  const next = sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : '/marketplace';
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(sp.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [info, setInfo] = useState('');
  const m = useMutation({ mutationFn: async () => {
    setInfo('');
    if (mode === 'login') {
      await signInWithEmailAndPassword(firebaseAuth, email, password); nav(next, { replace: true });
    } else if (mode === 'register') {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      await sendEmailVerification(credential.user, { url: `${location.origin}/login`, handleCodeInApp: false });
      setInfo('Account created. Check your inbox to confirm your email.');
    } else {
      await sendPasswordResetEmail(firebaseAuth, email, { url: `${location.origin}/reset-password`, handleCodeInApp: false });
      setInfo('If that email has an account, a reset link is on its way.');
    }
  }});
  const google = async () => { try { await signInWithPopup(firebaseAuth, new GoogleAuthProvider()); nav(next, { replace: true }); } catch (e) { setInfo(errMsg(e)); } };
  if (session && mode !== 'forgot' && !m.isPending) return <Navigate to={next} replace />;
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return <div className="card mx-auto max-w-md space-y-4 p-6"><h1 className="text-2xl font-extrabold">{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset password'}</h1><form onSubmit={submit} className="space-y-3">{mode === 'register' && <div><label className="label" htmlFor="n">Display name</label><input id="n" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>}<div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>{mode !== 'forgot' && <div><label className="label" htmlFor="p">Password</label><input id="p" type="password" className="input" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>}{m.isError && <Notice kind="error">{errMsg(m.error)}</Notice>}{info && <Notice kind="success">{info}</Notice>}<button className="btn-primary w-full" disabled={m.isPending}>{m.isPending ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Sign up' : 'Send reset link'}</button></form>{mode !== 'forgot' && <><div className="text-center text-xs text-slate-400">or</div><button className="btn-secondary w-full" onClick={google}>Continue with Google</button></>}<div className="flex justify-between text-sm">{mode === 'login' ? <button className="text-brand-600 underline" onClick={() => setMode('register')}>Create account</button> : <button className="text-brand-600 underline" onClick={() => setMode('login')}>Back to log in</button>}{mode === 'login' && <button className="text-brand-600 underline" onClick={() => setMode('forgot')}>Forgot password?</button>}</div></div>;
}

export function ResetPassword() {
  const nav = useNavigate(); const [pw, setPw] = useState(''); const [info, setInfo] = useState('');
  const code = new URLSearchParams(location.search).get('oobCode');
  const m = useMutation({ mutationFn: async () => { if (!code) throw new Error('Invalid or expired reset link'); await confirmPasswordReset(firebaseAuth, code, pw); }, onSuccess: () => { setInfo('Password updated. You can now log in.'); setTimeout(() => nav('/login'), 1200); } });
  return <form className="card mx-auto max-w-md space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}><h1 className="text-2xl font-extrabold">Choose a new password</h1><p className="text-sm text-slate-500">Open this page from the link in your reset email.</p><input type="password" className="input" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />{m.isError && <Notice kind="error">{errMsg(m.error)}</Notice>}{info && <Notice kind="success">{info}</Notice>}<button className="btn-primary w-full" disabled={m.isPending}>Update password</button></form>;
}

export function Safety() { const tips: [string, string][] = [['Meet in public places', 'Use a library, canteen or main gate during daytime. Bring a friend if you can.'], ['Inspect before you pay', 'Check the item works and matches the listing before handing over money.'], ['Confirm the price beforehand', 'Agree on the final price in chat before meeting.'], ['Share only what you need', 'Keep your room, phone number and personal details private until you trust the person.'], ['Never share passwords or verification codes', 'RevoShelf staff will never ask for them.'], ['Avoid suspicious payment links', 'Pay in person after inspecting the item.'], ['Report suspicious users and listings', 'Use the Report button when needed.']]; return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-3xl font-extrabold">Safety guidelines</h1><Notice>RevoShelf does <b>not</b> process payments, hold money or arrange delivery.</Notice><ol className="space-y-3">{tips.map(([t, d], i) => <li key={t} className="card flex gap-3 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</span><div><h2 className="font-bold">{t}</h2><p className="text-sm text-slate-500">{d}</p></div></li>)}</ol></div>; }
export function NotFound() { return <div className="py-20 text-center"><div className="text-6xl font-extrabold text-brand-600">404</div><p className="mt-2 text-slate-500">That page doesn't exist.</p><Link to="/" className="btn-primary mt-6">Go home</Link></div>; }
