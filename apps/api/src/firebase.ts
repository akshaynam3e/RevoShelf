import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function firebaseAdminAuth() {
  let service: { project_id?: string; client_email?: string; private_key?: string } = {};
  try { service = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) : {}; } catch { return null; }
  const projectId = service.project_id ?? process.env.FIREBASE_PROJECT_ID;
  const clientEmail = service.client_email ?? process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (service.private_key ?? process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getAuth(app);
}
