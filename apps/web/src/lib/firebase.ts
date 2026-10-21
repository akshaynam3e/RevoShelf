import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
let parsed: Record<string, string> = {};
try { parsed = rawConfig ? JSON.parse(rawConfig) as Record<string, string> : {}; } catch { console.error('Invalid VITE_FIREBASE_CONFIG JSON'); }

const config = {
  apiKey: parsed.apiKey ?? import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: parsed.authDomain ?? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: parsed.projectId ?? import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: parsed.storageBucket ?? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: parsed.messagingSenderId ?? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: parsed.appId ?? import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigError = Object.values(config).some((value) => !value) ? 'Missing Firebase web configuration' : null;
const app = initializeApp({ ...config, apiKey: config.apiKey ?? 'missing', authDomain: config.authDomain ?? 'missing.firebaseapp.com', projectId: config.projectId ?? 'missing', storageBucket: config.storageBucket ?? 'missing.appspot.com', messagingSenderId: config.messagingSenderId ?? 'missing', appId: config.appId ?? 'missing' });
export const firebaseAuth = getAuth(app);
