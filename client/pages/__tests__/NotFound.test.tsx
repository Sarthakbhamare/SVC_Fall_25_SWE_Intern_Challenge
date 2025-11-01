import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '../NotFound';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/missing' }),
  };
});

describe('NotFound page', () => {
  it('renders not found message and logs error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Oops! Page not found')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      '404 Error: User attempted to access non-existent route:',
      '/missing',
    );

    errorSpy.mockRestore();
  });
});
