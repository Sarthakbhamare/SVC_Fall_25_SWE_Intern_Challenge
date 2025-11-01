import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

const authStateListeners = new Set<(event: string, session: any) => void>();
let currentSession: any = null;

const getSession = vi.fn(async () => ({ data: { session: currentSession }, error: null }));
const signInWithOtp = vi.fn(async () => ({ data: {}, error: null }));
const signOut = vi.fn(async () => ({ error: null }));
const onAuthStateChange = vi.fn((callback: (event: string, session: any) => void) => {
  authStateListeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => authStateListeners.delete(callback),
      },
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signInWithOtp,
      signOut,
    },
  },
  __setTestSession(session: any) {
    currentSession = session;
    authStateListeners.forEach(listener => listener('SIGNED_IN', session));
  },
  __resetAuthMocks() {
    currentSession = null;
    getSession.mockClear();
    signInWithOtp.mockClear();
    signOut.mockClear();
    onAuthStateChange.mockClear();
    authStateListeners.clear();
  },
}));

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.stubGlobal('scrollTo', vi.fn());
