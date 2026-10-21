import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout, ProtectedRoute } from './components/Layout';
import { AuthProvider } from './lib/auth';
import { Landing, Login, NotFound, ResetPassword, Safety } from './pages/Public';
import { ListingDetail, ListingForm, Marketplace, MyListings, Saved, SellerProfile } from './pages/Listings';
import { Messages } from './pages/Messages';
import { Settings, Verify } from './pages/Account';
import { Admin } from './pages/Admin';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900"><div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold uppercase tracking-wide text-red-600">RevoShelf could not start</p><h1 className="mt-2 text-2xl font-bold">There was a problem loading the app.</h1><p className="mt-3 text-sm text-slate-600">Refresh the page. If this keeps happening, check the browser console and verify the Vite environment variables.</p><details className="mt-4 text-xs text-slate-500"><summary>Technical details</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre></details></div></div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/listings/:id" element={<ListingDetail />} />
              <Route path="/u/:id" element={<SellerProfile />} />
              <Route path="/safety" element={<Safety />} />
              <Route element={<ProtectedRoute allowIncomplete />}>
                <Route path="/settings" element={<Settings />} />
                <Route path="/verify" element={<Verify />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/listings/new" element={<ListingForm />} />
                <Route path="/listings/:id/edit" element={<ListingForm />} />
                <Route path="/my-listings" element={<MyListings />} />
                <Route path="/saved" element={<Saved />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/messages/:id" element={<Messages />} />
              </Route>
              <Route element={<ProtectedRoute admin />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>
);
