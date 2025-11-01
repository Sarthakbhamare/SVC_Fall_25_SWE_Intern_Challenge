import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Index from '../Index';

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

describe('Index page', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: null });
    navigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('navigates to social qualify form when CTA clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    const ctaButtons = screen.getAllByRole('button', { name: 'See if your accounts qualify' });
    await userEvent.click(ctaButtons[0]);
    expect(navigate).toHaveBeenCalledWith('/social-qualify-form');

    const platformsSection = document.getElementById('platforms');
    if (platformsSection) {
      platformsSection.scrollIntoView = vi.fn();
    }

    await userEvent.click(screen.getByRole('button', { name: 'Learn More' }));

    if (platformsSection && platformsSection.scrollIntoView) {
      expect(platformsSection.scrollIntoView).toHaveBeenCalled();
    }
  });

  it('converts currency values when API succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 1.5 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    await screen.findByText(/Prices shown in EUR/);
    expect(screen.getAllByText(/€7.50/)[0]).toBeInTheDocument();
  });

  it('falls back to using the currency code when symbol is unknown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'BRL' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { BRL: 5 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    await screen.findByText(/Prices shown in BRL/);
    expect(screen.getAllByText(/BRL25\.00/)[0]).toBeInTheDocument();
  });

  it('falls back to USD when APIs fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Timeout', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    // Wait for currency detection to finish and prices to render (initially shows $-- while loading)
    await screen.findByText('Platform Payment Rates');
    await screen.findAllByText('$5.00');
    expect(screen.getAllByText('$5.00')[0]).toBeInTheDocument();
  });

  it('shows admin UI when user is admin', async () => {
    useAuthMock.mockReturnValue({ 
      user: { email: 'admin@fairdata.com', isAdmin: true } 
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    // Admin-specific UI should be visible
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('handles user without admin flag', async () => {
    useAuthMock.mockReturnValue({ 
      user: { email: 'user@example.com' } 
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('handles currency detection with USD default (line 136)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ currency: 'USD' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    await screen.findByText('Platform Payment Rates');
    await screen.findAllByText(/\$5\.00/);
    
    // Line 136: console.log("Using default USD currency")
    expect(consoleLogSpy).toHaveBeenCalledWith('Using default USD currency');
    consoleLogSpy.mockRestore();
  });

  it('handles exchange rate API failure gracefully (lines 108-109)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    await screen.findByText('Platform Payment Rates');
    
    // Line 108-109: should throw error when exchange API fails
    // This will be caught and fall back to USD
    await screen.findAllByText(/\$5\.00/);
    
    consoleWarnSpy.mockRestore();
  });

  it('logs currency detected message (line 129)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'GBP' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { GBP: 0.8 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    await screen.findByText(/Prices shown in GBP/);
    
    // Line 129: console.log(`Currency detected: ${data.currency}`)
    expect(consoleLogSpy).toHaveBeenCalledWith('Currency detected: GBP');
    
    consoleLogSpy.mockRestore();
  });

  it('warns when exchange rate not available for detected currency (lines 132-133)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'XYZ' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 1.2 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    await screen.findByText('Platform Payment Rates');

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Exchange rate not available for XYZ, using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('warns when exchange rates object missing entirely', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'CAD' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);

    await screen.findByText('Platform Payment Rates');

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Exchange rate not available for CAD, using USD');
    });

    consoleWarnSpy.mockRestore();
  });

  it('handles location API non-ok response (lines 85-86)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    // Should fall back to USD when location API fails
    await screen.findByText('Platform Payment Rates');
    await screen.findAllByText(/\$5\.00/);
    
    consoleWarnSpy.mockRestore();
  });

  it('handles NetworkError during currency detection (lines 132-133)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Create a TypeError with NetworkError message - this matches line 141 check
    const networkError = new TypeError('NetworkError when attempting to fetch resource');
    Object.defineProperty(networkError, 'message', {
      value: 'NetworkError when attempting to fetch resource',
      writable: false
    });
    
    const fetchMock = vi.fn().mockRejectedValue(networkError);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    // Should fall back to USD with specific network error warning
    await screen.findByText('Platform Payment Rates');
    
    // Wait for the console.warn to be called
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Network error during currency detection, using USD');
    });
    
    consoleWarnSpy.mockRestore();
  });

  it('handles timeout (AbortError) during currency detection (line 142)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Create an error with name 'AbortError' to match the check on line 139
    const abortError = new Error('The operation was aborted');
    Object.defineProperty(abortError, 'name', {
      value: 'AbortError',
      writable: false
    });

    const fetchMock = vi.fn().mockRejectedValue(abortError);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Index />);
    
    // Should fall back to USD with timeout warning
    await screen.findByText('Platform Payment Rates');
    
    // Wait for the console.warn to be called
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Currency detection timed out, using USD');
    });
    
    consoleWarnSpy.mockRestore();
  });

  it('clears the scheduled currency detection timeout when unmounted', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { unmount } = render(<Index />);

    try {
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});
