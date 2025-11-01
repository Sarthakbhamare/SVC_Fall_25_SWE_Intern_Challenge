import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCurrency } from '../useCurrency';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCurrency', () => {
  it('detects and formats non-USD currency', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { EUR: 2 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('EUR');
    expect(result.current.formatCurrency(1)).toBe('€2.00');
  });

  it('falls back to USD on abort error', async () => {
    const abortError = new DOMException('Timeout', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
  });

  it('handles network errors from exchange API gracefully', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockRejectedValueOnce(new TypeError('NetworkError: offline'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
  });

  it('handles non-ok exchange API responses (lines 58-59)', async () => {
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
        json: async () => ({})
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('falls back to currency code when symbol is unknown', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'NZD' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: { NZD: 1.8 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.symbol).toBe('NZD');
    expect(result.current.formatCurrency(1)).toBe('NZD1.80');
  });

  it('handles unexpected API status codes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(result.current.formatCurrency(1)).toBe('$1.00');
  });

  it('handles malformed JSON from currency detection API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Invalid JSON'); },
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
  });

  it('handles missing rates in exchange rate response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ currency: 'EUR' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ rates: {} }), // Missing EUR rate
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    // Should fall back to USD since rate wasn't found
    expect(result.current.currency.code).toBe('USD');
  });

  it('handles timeout during currency detection', async () => {
    const abortError = new DOMException('AbortError', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValueOnce(abortError);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
  });

  it('handles generic errors from currency APIs', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('Generic error'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    consoleWarnSpy.mockRestore();
  });

  it('logs when currency is detected successfully', async () => {
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
        json: async () => ({ rates: { GBP: 1.5 } }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('GBP');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Currency detected: GBP'));
    
    consoleLogSpy.mockRestore();
  });

  it('warns when exchange rate not available', async () => {
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
        json: async () => ({ rates: { EUR: 1.2 } }), // XYZ not in rates
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Exchange rate not available for XYZ'));
    
    consoleWarnSpy.mockRestore();
  });

  it('logs when using default USD', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ currency: 'USD' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(consoleLogSpy).toHaveBeenCalledWith('Using default USD currency');
    
    consoleLogSpy.mockRestore();
  });

  it('handles NetworkError specifically in catch block (lines 85-86)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const networkError = new TypeError('NetworkError when attempting to fetch resource');
    const fetchMock = vi.fn().mockRejectedValueOnce(networkError);

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => expect(result.current.currencyLoading).toBe(false), { timeout: 1000 });

    expect(result.current.currency.code).toBe('USD');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Network error during currency detection, using USD');
    
    consoleWarnSpy.mockRestore();
  });
});
