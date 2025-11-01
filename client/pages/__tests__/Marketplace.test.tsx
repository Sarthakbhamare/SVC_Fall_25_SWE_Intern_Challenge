import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Marketplace, { type Company } from '../Marketplace';

const navigate = vi.fn();

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

describe('Marketplace page', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('navigates to available company details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as unknown as typeof fetch);

    render(<Marketplace />);

    await userEvent.click(screen.getByText('Silicon Valley Consulting'));
    expect(navigate).toHaveBeenCalledWith('/companies/silicon-valley-consulting');
  });

  it('displays locked alert when clicking unavailable company', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as unknown as typeof fetch);

    render(<Marketplace />);

    await userEvent.click(screen.getByText('Tech Innovations Corp'));

    expect(await screen.findByText(/Company Locked/)).toBeInTheDocument();
  });

  it('renders converted currency values when APIs succeed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'GBP' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { GBP: 2 } }) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    expect(await screen.findByText(/All compensation amounts shown in GBP/)).toBeInTheDocument();
  });

  it('uses the currency code when no symbol mapping exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ currency: 'BRL' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ rates: { BRL: 5 } }) });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    expect(await screen.findByText(/All compensation amounts shown in BRL/)).toBeInTheDocument();
    expect(screen.getByText('BRL10.00/hour + BRL2500.00 bonus')).toBeInTheDocument();
  });

  it('falls back to USD on failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Timeout', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    expect(await screen.findByText('Company Marketplace')).toBeInTheDocument();
    // Wait for currency detection to complete (initially shows $-- while loading)
    await screen.findAllByText(/\$2\.00/);
    expect(screen.getAllByText(/\$2\.00/)[0]).toBeInTheDocument();
  });

  it('handles API errors for currency detection gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    // Should fall back to USD
    await screen.findByText('Company Marketplace');
    await screen.findAllByText(/\$2\.00/);
    expect(screen.getAllByText(/\$2\.00/)[0]).toBeInTheDocument();
  });

  it('displays company cards with correct locked/unlocked states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ 
      ok: false, 
      status: 500, 
      json: async () => ({}) 
    }) as unknown as typeof fetch);

    render(<Marketplace />);

    // Verify available company
    expect(screen.getByText('Silicon Valley Consulting')).toBeInTheDocument();

    // Verify locked companies
    expect(screen.getByText('Tech Innovations Corp')).toBeInTheDocument();
    expect(screen.getByText('Digital Marketing Pro')).toBeInTheDocument();
  });

  it('handles exchange rate API failure for detected currency (lines 92-93)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);
    
    // Should fall back to USD when exchange API fails
    await screen.findByText('Company Marketplace');
    await screen.findAllByText(/\$2\.00/);
    
    consoleWarnSpy.mockRestore();
  });

  it('handles missing exchange rate for detected currency (lines 116-117)', async () => {
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
        json: async () => ({ rates: { USD: 1, EUR: 0.9 } }), // Missing XYZ
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);
    
    await screen.findByText('Company Marketplace');
    
    // Wait for console.warn to be called
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Exchange rate not available for XYZ, using USD');
    });
    
    consoleWarnSpy.mockRestore();
  });

  it('handles USD default currency (lines 119-120)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ currency: 'USD' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);
    
    await screen.findByText('Company Marketplace');
    
    // Wait for console.log to be called
    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith('Using default USD currency');
    });
    
    consoleLogSpy.mockRestore();
  });

  it('handles NetworkError during currency detection (line 126)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const networkError = new TypeError('NetworkError when attempting to fetch resource');
    const fetchMock = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    await screen.findByText('Company Marketplace');
    
    // Wait for console.warn to be called
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Network error during currency detection, using USD');
    });
    
    consoleWarnSpy.mockRestore();
  });

  it('handles generic error with message during currency detection (line 126)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const genericError = new Error('Something went wrong');
    const fetchMock = vi.fn().mockRejectedValue(genericError);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Marketplace />);

    await screen.findByText('Company Marketplace');
    
    // Wait for console.warn to be called
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith('Currency detection failed:', 'Something went wrong', '- using USD');
    });
    
    consoleWarnSpy.mockRestore();
  });

  it('navigates to generic company route for available non-SVC companies (lines 417-418)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    }) as unknown as typeof fetch);

    const availableNonSvc: Company = {
      id: 'global-tech-alliance',
      name: 'Global Tech Alliance',
      acronym: 'GTA',
      description: 'Worldwide technology consulting collective',
      hourlyRate: 4.25,
      bonus: 700,
      hiresCount: 18,
      gradient: 'from-slate-600 to-slate-800',
      isAvailable: true,
      category: 'Technology'
    };

    render(<Marketplace companiesOverride={[availableNonSvc]} />);

    await userEvent.click(screen.getByText('Global Tech Alliance'));
    expect(navigate).toHaveBeenCalledWith('/companies/global-tech-alliance');
  });

  it('clears the delayed currency detection when component unmounts', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { unmount } = render(<Marketplace />);

    try {
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});
