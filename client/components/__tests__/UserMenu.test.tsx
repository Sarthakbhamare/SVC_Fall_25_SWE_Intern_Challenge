import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from '../UserMenu';

interface AuthState {
  loading: boolean;
  user: { email: string } | null;
  signOut: () => Promise<{ error: null } | { error: Error }>;
}

const useAuthMock = vi.fn<() => AuthState>();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../MagicLinkAuth', () => ({
  MagicLinkAuth: ({ onClose }: { onClose?: () => void }) => (
    <div>
      <button type="button" onClick={onClose}>close-auth</button>
    </div>
  ),
}));

describe('UserMenu', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('renders loading state', () => {
    useAuthMock.mockReturnValue({
      loading: true,
      user: null,
      signOut: async () => ({ error: null }),
    });

    render(<UserMenu />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders sign-in dialog when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({
      loading: false,
      user: null,
      signOut: async () => ({ error: null }),
    });

    render(<UserMenu />);

    expect(screen.getByText('Sign In')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Sign In'));

    expect(await screen.findByText('close-auth')).toBeInTheDocument();
    await userEvent.click(screen.getByText('close-auth'));
  });

  it('allows the current user to sign out via dropdown menu', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    useAuthMock.mockReturnValue({
      loading: false,
      user: { email: 'user@example.com' },
      signOut,
    });

    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalled();
  });

  it('handles sign-out error gracefully', async () => {
    const signOut = vi.fn().mockResolvedValue({ 
      error: new Error('Failed to sign out') 
    });
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    useAuthMock.mockReturnValue({
      loading: false,
      user: { email: 'user@example.com' },
      signOut,
    });

    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalled();
    // console.error is called (may include React warnings too)
    expect(consoleErrorSpy).toHaveBeenCalled();
    
    consoleErrorSpy.mockRestore();
  });

  it('handles sign-out exception in catch block (line 30)', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('Network error'));
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    useAuthMock.mockReturnValue({
      loading: false,
      user: { email: 'test@example.com' },
      signOut,
    });

    render(<UserMenu />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Sign out error:', expect.any(Error));
    
    consoleErrorSpy.mockRestore();
  });

  it('handles user without email property (lines 66-72)', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    useAuthMock.mockReturnValue({
      loading: false,
      user: { email: undefined } as any, // User without email
      signOut,
    });

    render(<UserMenu />);

    // Should show "Account" as fallback
    expect(screen.getByText('Account')).toBeInTheDocument();
    
    // Open dropdown to check fallback for user display name
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('User')).toBeInTheDocument(); // Fallback for display name
  });
});
