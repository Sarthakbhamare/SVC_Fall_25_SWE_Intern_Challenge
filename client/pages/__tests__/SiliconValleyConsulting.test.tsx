import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import SiliconValleyConsulting from '../SiliconValleyConsulting';

const navigate = vi.fn();
const useAuthMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('Silicon Valley Consulting page', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: null });
    navigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('prompts user to sign in before joining slack', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(screen.getByText(/Please sign in to join this company/)).toBeInTheDocument();
  });

  it('submits contractor request successfully for authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Request sent' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });

  it('redirects to qualification form when backend requests it', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad request',
      json: async () => ({ message: 'Please complete the qualification form first.' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText(/Redirecting you there now/)).toBeInTheDocument();

    // Wait for navigation
    await new Promise(resolve => setTimeout(resolve, 3100));
    expect(navigate).toHaveBeenCalledWith('/social-qualify-form');
  });

  it('shows Start Job disabled until approved', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as unknown as typeof fetch);

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<SiliconValleyConsulting />);

    // Button should be disabled and not trigger alert when clicked
    const startJobButton = screen.getByRole('button', { name: /waiting for approval/i });
    expect(startJobButton).toBeDisabled();
    await userEvent.click(startJobButton);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('disables Join Slack button after successful request', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Request sent' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    const joinButton = screen.getByRole('button', { name: /join slack/i });
    expect(joinButton).not.toBeDisabled();

    await userEvent.click(joinButton);

    // After successful request, button should be disabled
    expect(await screen.findByRole('button', { name: /request sent/i })).toBeDisabled();
  });

  it('handles network errors when submitting contractor request', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('falls back to a generic error message when contractor request lacks details', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.startsWith('https://')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ currency: 'USD' }),
        });
      }

      if (url === '/api/contractor-request') {
        return Promise.reject({});
      }

      return Promise.reject(new Error(`Unexpected fetch call to ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });

  it('handles 500 server errors gracefully', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Database error' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText(/Database error/)).toBeInTheDocument();
  });

  it('handles JSON parse errors from server response', async () => {
    useAuthMock.mockReturnValue({ user: { email: 'user@example.com' } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => { throw new Error('Invalid JSON'); },
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await userEvent.click(screen.getByRole('button', { name: /join slack/i }));

    expect(await screen.findByText('HTTP 400: Bad Request')).toBeInTheDocument();
  });

  it('displays currency conversions when API succeeds', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'EUR' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { EUR: 1.2 } }) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    expect(await screen.findByText(/Prices shown in EUR/)).toBeInTheDocument();
  });

  it('falls back to the currency code when no symbol mapping exists', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'BRL' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { BRL: 5 } }) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    expect(await screen.findByText(/Prices shown in BRL/)).toBeInTheDocument();
    expect(screen.getByText('BRL10.00/hour + BRL2500.00 performance bonus')).toBeInTheDocument();
  });

  it('handles AbortError during currency detection timeout', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Currency detection timed out, using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles non-ok exchange rate API responses (lines 83-84)', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'EUR' }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Currency detection failed:', 'Exchange API responded with 503', '- using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles NetworkError during currency detection', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const networkError = new TypeError('NetworkError when attempting to fetch resource');
    
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Network error during currency detection, using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles generic error during currency detection with error message', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const genericError = new Error('Failed to fetch');
    
    const fetchMock = vi.fn().mockRejectedValue(genericError);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Currency detection failed:', 'Failed to fetch', '- using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles missing exchange rate for detected currency', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'XYZ' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { EUR: 1.2 } }) }); // XYZ rate not in response

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Exchange rate not available for XYZ, using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles missing currency in location API response', async () => {
    useAuthMock.mockReturnValue({ user: null });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) }); // No currency field

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith('Using default USD currency');
    });

    consoleLogSpy.mockRestore();
  });

  it('shows approved state and triggers Start Job alert (lines 211-215, 549-562)', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'approved@example.com' }
    });

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ currency: 'USD' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting initialCanStartJob />);

    expect(await screen.findByText('Ready to Start')).toBeInTheDocument();

    const startJobButton = await screen.findByRole('button', { name: 'Start Job' });
    expect(startJobButton).toBeEnabled();

    await userEvent.click(startJobButton);

    expect(alertMock).toHaveBeenCalledWith(
      "Job dashboard coming soon! You'll be able to submit daily tasks and track payments here."
    );

    alertMock.mockRestore();
  });

  it('handles user without email property (lines 549-554)', async () => {
    useAuthMock.mockReturnValue({ 
      user: { id: '123' } // No email property
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    // Should render "Sign In to Join Slack" when user doesn't have email
    expect(await screen.findByText('Sign In to Join Slack')).toBeInTheDocument();
  });

  it('renders canStartJob as false when conditions not met (line 562)', async () => {
    useAuthMock.mockReturnValue({ 
      user: { email: 'newuser@example.com' } 
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SiliconValleyConsulting />);

    // Start Job button should be "Waiting for Approval" when joinSlackRequested is false
    const startJobButton = await screen.findByText('Waiting for Approval');
    expect(startJobButton).toBeDisabled();
  });

  it('clears the scheduled currency detection timeout on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { unmount } = render(<SiliconValleyConsulting />);

    try {
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});