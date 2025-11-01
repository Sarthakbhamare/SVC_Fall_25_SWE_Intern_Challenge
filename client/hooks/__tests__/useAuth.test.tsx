import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AuthProvider, useAuth } from '../useAuth'

const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockSignInWithOtp = vi.fn()
const mockSignOut = vi.fn()
const mockUnsubscribe = vi.fn()

let authStateListener: ((event: string, session: any) => void) | null = null

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        authStateListener = callback
        return mockOnAuthStateChange(callback)
      },
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('useAuth', () => {
  beforeEach(() => {
    authStateListener = null

    mockGetSession.mockReset()
    mockOnAuthStateChange.mockReset()
    mockSignInWithOtp.mockReset()
    mockSignOut.mockReset()
    mockUnsubscribe.mockReset()

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockOnAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    }))

    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('throws when used outside of the AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrowError(
      'useAuth must be used within an AuthProvider',
    )
  })

  it('loads the initial session data', async () => {
    const user = { id: 'user-1', email: 'user@example.com' }
    const session = { user }
    mockGetSession.mockResolvedValue({
      data: { session },
      error: null,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toEqual(user)
    expect(result.current.session).toEqual(session)
  })

  it('logs an error when the session response contains an error', async () => {
    const error = { message: 'Session issue' }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error,
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('Error getting session:', error)
    consoleSpy.mockRestore()
  })

  it('logs an error when the session fetch rejects', async () => {
    const failure = new Error('Network failure')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSession.mockRejectedValue(failure)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to get initial session:',
      failure,
    )
    consoleSpy.mockRestore()
  })

  it('skips state updates when unmounted before the initial session resolves', async () => {
    let resolveSession: ((value: unknown) => void) | undefined

    mockGetSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )

    const { unmount } = renderHook(() => useAuth(), { wrapper })

    unmount()

    await act(async () => {
      resolveSession?.({
        data: {
          session: { user: { id: 'late-user', email: 'late@example.com' } },
        },
        error: null,
      })
      await Promise.resolve()
    })

    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('updates state when the auth listener reports a new session', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const user = { id: 'user-2', email: 'new@example.com' }

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(authStateListener).toBeTruthy()

    await act(async () => {
      authStateListener?.('SIGNED_IN', { user })
      await Promise.resolve()
    })

    expect(consoleSpy).toHaveBeenCalledWith('Auth state changed:', 'SIGNED_IN', {
      user,
    })
    expect(result.current.user).toEqual(user)
    expect(result.current.session).toEqual({ user })
    expect(result.current.loading).toBe(false)
    consoleSpy.mockRestore()
  })

  it('resets auth state when listener supplies a null session', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(authStateListener).toBeTruthy()

    await act(async () => {
      authStateListener?.('SIGNED_OUT', null)
      await Promise.resolve()
    })

    expect(consoleSpy).toHaveBeenCalledWith('Auth state changed:', 'SIGNED_OUT', null)
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    consoleSpy.mockRestore()
  })

  it('ignores auth listener updates after unmount', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(authStateListener).toBeTruthy()

    unmount()

    await act(async () => {
      authStateListener?.('SIGNED_IN', {
        user: { id: 'ignored', email: 'ignored@example.com' },
      })
      await Promise.resolve()
    })

    expect(consoleSpy).not.toHaveBeenCalled()
    expect(mockUnsubscribe).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('uses the configured site URL for magic link sign-in redirects', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://custom.example')

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      const response = await result.current.signInWithMagicLink('user@example.com')
      expect(response.error).toBeNull()
    })

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: { emailRedirectTo: 'https://custom.example' },
    })
  })

  it('falls back to window origin when the site URL env is missing', async () => {
    const origin = window.location.origin
    vi.stubEnv('VITE_SITE_URL', '')

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signInWithMagicLink('user@example.com')
    })

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: { emailRedirectTo: origin },
    })
  })

  it('signs out successfully and clears local auth state', async () => {
    const user = { id: 'user-3', email: 'keep@example.com' }
    const session = { user }
    mockGetSession.mockResolvedValue({
      data: { session },
      error: null,
    })
    mockSignOut.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.user).toEqual(user))

    await act(async () => {
      const response = await result.current.signOut()
      expect(response.error).toBeNull()
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
    expect(result.current.session).toBeNull()
  })

  it('preserves auth state when sign out returns an error', async () => {
    const user = { id: 'user-4', email: 'persist@example.com' }
    const session = { user }
    mockGetSession.mockResolvedValue({
      data: { session },
      error: null,
    })
    const signOutError = { message: 'Unable to sign out' }
    mockSignOut.mockResolvedValue({ error: signOutError })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.user).toEqual(user))

    await act(async () => {
      const response = await result.current.signOut()
      expect(response.error).toEqual(signOutError)
    })

    expect(result.current.user).toEqual(user)
    expect(result.current.session).toEqual(session)
  })
})
