import { describe, it, expect, beforeEach, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock('react-dom/client', async () => ({
  createRoot: createRootMock,
}));

describe('App bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    renderMock.mockReset();
    createRootMock.mockClear();
  });

  it('mounts the React application when root container is empty', async () => {
    await import('./App');

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('avoids remounting when root already initialised', async () => {
    const container = document.getElementById('root') as any;
    container._reactRootContainer = { render: vi.fn() };

    await import('./App');

    expect(createRootMock).not.toHaveBeenCalled();
  });
});
