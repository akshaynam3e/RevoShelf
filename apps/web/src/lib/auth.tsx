import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { MeDTO } from '@revoshelf/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { firebaseAuth } from './firebase';

interface AuthCtx {
  session: User | null;
  me: MeDTO | undefined;
  loading: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ session: null, me: undefined, loading: true, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    setSession(user);
    setReady(true);
    if (!user) qc.clear();
    else qc.invalidateQueries({ queryKey: ['me'] });
  }), [qc]);

  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api<MeDTO>('/me'), enabled: !!session, retry: false, staleTime: 60_000 });
  const value = useMemo<AuthCtx>(() => ({
    session,
    me: meQ.data,
    loading: !ready || (!!session && meQ.isLoading),
    signOut: () => signOut(firebaseAuth),
  }), [session, meQ.data, meQ.isLoading, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
