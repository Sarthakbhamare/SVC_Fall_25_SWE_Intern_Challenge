import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SocialQualifyForm from '../SocialQualifyForm';

const signInWithMagicLink = vi.fn();
const navigate = vi.fn();
const useCurrencyMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signInWithMagicLink }),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => useCurrencyMock(),
}));

const fillForm = async () => {
  await userEvent.type(screen.getByLabelText('Email Address *'), 'user@example.com');
  await userEvent.type(screen.getByLabelText('Phone Number *'), '+1234567890');
  await userEvent.type(screen.getByRole('textbox', { name: /reddit username/i }), 'reddituser');
  await userEvent.type(screen.getByRole('textbox', { name: /twitter.*username/i }), 'twuser');
  await userEvent.type(screen.getByRole('textbox', { name: /youtube channel/i }), 'ytuser');
  await userEvent.type(screen.getByRole('textbox', { name: /facebook username/i }), 'fbuser');
};

describe('SocialQualifyForm', () => {
  beforeEach(() => {
    signInWithMagicLink.mockReset();
    signInWithMagicLink.mockResolvedValue({ error: null });
    navigate.mockReset();
    useCurrencyMock.mockReset();
    useCurrencyMock.mockReturnValue({
      currency: { code: 'USD', symbol: '$', rate: 1 },
      currencyLoading: false,
      formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('submits the form successfully and shows matched company', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'ok',
          data: {
            matchedCompany: {
              name: 'Silicon Valley Consulting',
              slug: 'silicon-valley-consulting',
              payRate: '$2.00 per hour',
              bonus: '$500',
            },
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('Application Status Update')).toBeInTheDocument();
    expect(screen.getByText('Silicon Valley Consulting')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Click here to learn more'));
    expect(navigate).toHaveBeenCalledWith('/companies/silicon-valley-consulting');
  });

  it('keeps success screen hidden when API returns success false', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: false, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: false, message: 'processed' }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    await waitFor(() => expect(signInWithMagicLink).toHaveBeenCalled());
    expect(screen.queryByText('Application Status Update')).not.toBeInTheDocument();
  });

  it('prevents duplicate submissions when user already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, userExists: true }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText(/already signed up/)).toBeInTheDocument();
    expect(signInWithMagicLink).not.toHaveBeenCalled();
  });

  it('shows validation errors from Zod schema', async () => {
    vi.stubGlobal('fetch', vi.fn() as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    // Fill other required fields to bypass native required validation and hit Zod
    await userEvent.type(screen.getByLabelText('Email Address *'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Phone Number *'), '+1234567890');
    await userEvent.type(screen.getByRole('textbox', { name: /reddit username/i }), 'someuser');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    // The form shows the Zod validation error message
    expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
  });

  it('surface API errors when check-user-exists fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ message: 'boom' }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('surface API errors when social qualify submission fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'invalid reddit user' }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('invalid reddit user')).toBeInTheDocument();
  });

  it('handles network errors from check-user-exists', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('handles network errors from social qualify submission', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockRejectedValueOnce(new Error('Network timeout'));

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('Network timeout')).toBeInTheDocument();
  });

  it('handles JSON parse errors gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => { throw new Error('Invalid JSON'); },
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    // Since JSON parsing fails in check-user-exists, it shows the fallback message
    expect(await screen.findByText('Failed to check user existence')).toBeInTheDocument();
  });

  it('covers console.log in successful submission path', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'ok',
          data: {
            matchedCompany: {
              name: 'Test Company',
              slug: 'test-company',
              payRate: '$2.00',
              bonus: '$500',
            },
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    await screen.findByText('Application Status Update');
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Creating Supabase user'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Magic link sent successfully'));
    
    consoleLogSpy.mockRestore();
  });

  it('shows loading placeholders when currency detection still running', async () => {
    const formatSpy = vi.fn((amount: number) => `converted ${amount}`);

    useCurrencyMock.mockReturnValue({
      currency: { code: 'USD', symbol: '$', rate: 1 },
      currencyLoading: true,
      formatCurrency: formatSpy,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'ok',
          data: {
            matchedCompany: {
              name: 'Silicon Valley Consulting',
              slug: 'silicon-valley-consulting',
              payRate: '$2.00 per hour',
              bonus: '$500',
            },
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('Application Status Update')).toBeInTheDocument();
    expect(formatSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/converted/)).not.toBeInTheDocument();
  });

  it('renders converted currency note when non-USD symbol available', async () => {
    useCurrencyMock.mockReturnValue({
      currency: { code: 'EUR', symbol: '€', rate: 0.9 },
      currencyLoading: false,
      formatCurrency: (amount: number) => `€${(amount * 0.9).toFixed(2)}`,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, userExists: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'ok',
          data: {
            matchedCompany: {
              name: 'Silicon Valley Consulting',
              slug: 'silicon-valley-consulting',
              payRate: '$2.00 per hour',
              bonus: '$500',
            },
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText(/Prices shown in EUR/)).toBeInTheDocument();
  });

  it('covers empty catch block when JSON parsing fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => { throw new Error('Bad JSON'); },
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    // When JSON parsing fails in check-user-exists, it falls back to "Failed to check user existence"
    expect(await screen.findByText('Failed to check user existence')).toBeInTheDocument();
  });

  it('handles authentication error from signInWithMagicLink (lines 82-83)', async () => {
    signInWithMagicLink.mockResolvedValue({
      error: { message: 'Invalid email domain' }
    });

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ exists: false }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    // Should show authentication error
    expect(await screen.findByText(/Authentication error: Invalid email domain/)).toBeInTheDocument();
  });

  it('handles HTTP error without valid JSON response (lines 100-106)', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ exists: false }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON'); },
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    // Should show HTTP error fallback message
    expect(await screen.findByText(/HTTP 500: Internal Server Error/)).toBeInTheDocument();
  });

  it('uses server-provided message when social qualify submission fails', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ exists: false }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Rejected for compliance review' }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('Rejected for compliance review')).toBeInTheDocument();
  });

  it('falls back to HTTP status message when social qualify error lacks details', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ exists: false }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({}),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('HTTP 400: Bad Request')).toBeInTheDocument();
  });

  it('falls back to a generic error message when no details are provided', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ userExists: false }),
      })
      .mockRejectedValueOnce({});

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<SocialQualifyForm />);
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
  });
});
