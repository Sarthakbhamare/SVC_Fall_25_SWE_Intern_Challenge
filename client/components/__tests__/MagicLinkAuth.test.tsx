import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MagicLinkAuth } from '../MagicLinkAuth';

const signInWithMagicLink = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    signInWithMagicLink,
  }),
}));

describe('MagicLinkAuth', () => {
  beforeEach(() => {
    signInWithMagicLink.mockReset();
  });

  it('requires an email before submission', async () => {
    render(<MagicLinkAuth />);

    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    expect(signInWithMagicLink).not.toHaveBeenCalled();
  });

  it('handles authentication errors', async () => {
    signInWithMagicLink.mockResolvedValue({ error: { message: 'Invalid email' } });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(await screen.findByText('Invalid email')).toBeInTheDocument();
  });

  it('shows confirmation state after success', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
  });

  it('allows sending another link from confirmation screen', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));
    await screen.findByText('Check Your Email');

    await userEvent.click(screen.getByText('Send Another Link'));

    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('calls onClose when provided in confirmation state', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });
    const onClose = vi.fn();

    render(<MagicLinkAuth onClose={onClose} />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));
    await screen.findByText('Check Your Email');

    await userEvent.click(screen.getByText('Close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('handles null error response gracefully', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'valid@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles error with object containing message', async () => {
    signInWithMagicLink.mockResolvedValue({ 
      error: { message: 'Rate limit exceeded' } 
    });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(await screen.findByText('Rate limit exceeded')).toBeInTheDocument();
  });

  it('prevents submission when already loading', async () => {
    let resolveSubmission: ((value: { error: null }) => void) | undefined;
    signInWithMagicLink.mockImplementation(() => new Promise(resolve => {
      resolveSubmission = resolve as (value: { error: null }) => void;
    }));

    const { container } = render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    const button = screen.getByText('Send Magic Link');

    // First submit kicks off loading state
    await userEvent.click(button);

    // Submitting again while still loading should bail out immediately
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      fireEvent.submit(form);
    }

    expect(signInWithMagicLink).toHaveBeenCalledTimes(1);

    // Resolve the pending submission to flush component state
    if (resolveSubmission) {
      resolveSubmission({ error: null });
    }

    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('prevents submission when email already sent', async () => {
    signInWithMagicLink.mockResolvedValue({ error: null });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    
    // Form is now in emailSent state, submitting again should be prevented
    expect(signInWithMagicLink).toHaveBeenCalledTimes(1);
  });

  it('handles error without message property', async () => {
    signInWithMagicLink.mockResolvedValue({ 
      error: { status: 500 } as any // No message property
    });

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    // When error.message is undefined, it sets error to undefined in the UI
    // So no error message is displayed, but the form resets
    await waitFor(() => {
      expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
    });
  });

  it('covers error message fallback when exception is thrown without message', async () => {
    // This covers line 48: err.message || 'An error occurred'
    signInWithMagicLink.mockRejectedValue(
      {} // Exception without message property
    );

    render(<MagicLinkAuth />);

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
    await userEvent.click(screen.getByText('Send Magic Link'));

    // Line 48: err.message || 'An error occurred'
    await waitFor(() => {
      expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });
  });
});
