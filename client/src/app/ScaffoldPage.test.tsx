import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScaffoldPage } from './ScaffoldPage.js';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScaffoldPage />
    </QueryClientProvider>,
  );
}

describe('application shell', () => {
  it('shows pending connectivity before a valid service response', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    );
    renderPage();
    expect(
      screen.getByText('Checking service connection…'),
    ).toBeInTheDocument();
    resolveResponse(
      Response.json({
        data: { status: 'ready' },
        meta: { requestId: 'request-1' },
      }),
    );
    expect(
      await screen.findByText('Service connected and ready.'),
    ).toBeInTheDocument();
  });

  it('shows a retryable error and recovers after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(
        Response.json({
          data: { status: 'ready' },
          meta: { requestId: 'request-2' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('Service connected and ready.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/health/ready');
  });
});
