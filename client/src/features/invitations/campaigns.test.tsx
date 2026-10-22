import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EmailBatch } from '@wedding-suite/shared/campaigns';
import { ApiClientError } from '../../api/client.js';
import { EmailBatchesPage } from './EmailBatchesPage.js';
import * as api from './campaign-api.js';
import * as families from './api.js';
vi.mock('./campaign-api.js', () => ({
  batches: vi.fn(),
  previewEmail: vi.fn(),
  getBatch: vi.fn(),
  confirmBatch: vi.fn(),
  retryDispatch: vi.fn(),
  reconcileDispatch: vi.fn(),
}));
vi.mock('./api.js', () => ({ list: vi.fn() }));
const id = 'a'.repeat(24),
  batchId = 'b'.repeat(24),
  jobId = 'c'.repeat(24),
  timestamp = new Date().toISOString();
const preview: EmailBatch = {
  id: batchId,
  revision: 1,
  status: 'preview',
  createdAt: timestamp,
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  mode: 'outbox',
  quota: { day: '2026-10-19', timezone: 'Asia/Kolkata', firstRemaining: 25 },
  items: [
    {
      invitationId: id,
      kind: 'first',
      to: 'family@example.test',
      subject: 'Wedding invitation',
      text: 'A reviewed synthetic invitation',
    },
  ],
  dispatches: [],
};
const confirmed: EmailBatch = {
  ...preview,
  revision: 2,
  status: 'confirmed',
  items: [{ invitationId: id, kind: 'first' }],
  dispatches: [
    {
      id: jobId,
      invitationId: id,
      batchId,
      kind: 'first',
      familyDisplayName: 'Test Family',
      status: 'outbox',
      delivery: 'pending',
      revision: 3,
      attempts: 1,
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      canRetry: false,
    },
  ],
};
function view() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <EmailBatchesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(families.list).mockResolvedValue({
    data: [
      {
        id,
        familyDisplayName: 'Test Family',
        contactName: 'Private contact',
        phone: '',
        email: 'family@example.test',
        eventIds: ['d'.repeat(24)],
        revision: 1,
        sentStatus: 'not_sent',
        sentAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedEventIds: [],
      },
    ],
    meta: { requestId: 'test', hasMore: false, nextCursor: null },
  });
  vi.mocked(api.batches).mockResolvedValue({
    data: [],
    meta: { requestId: 'test', hasMore: false, nextCursor: null },
  });
  vi.mocked(api.previewEmail).mockResolvedValue(preview);
  vi.mocked(api.confirmBatch).mockResolvedValue(confirmed);
  vi.mocked(api.getBatch).mockResolvedValue(confirmed);
});
it('requires a reviewed preview and explicit outbox confirmation without automatically dispatching', async () => {
  view();
  fireEvent.click(await screen.findByRole('checkbox', { name: /Test Family/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview email batch' }));
  await screen.findByRole('heading', { name: 'Review before sending' });
  expect(screen.getByText('To: family@example.test')).toBeVisible();
  expect(api.confirmBatch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm 1 outbox messages' }),
  );
  await screen.findByText(
    'Batch confirmed for private outbox testing. No real email is sent.',
  );
  expect(api.confirmBatch).toHaveBeenCalledWith(batchId, 1);
  expect(
    await screen.findByText('Local message only. Sent status was not changed.'),
  ).toBeVisible();
});
it('retains the reviewed batch and selection when confirmation detects a concurrent edit', async () => {
  vi.mocked(api.confirmBatch).mockRejectedValue(
    new ApiClientError(
      412,
      'REVISION_CONFLICT',
      'A selected family changed. Prepare a fresh preview.',
    ),
  );
  view();
  const checkbox = await screen.findByRole('checkbox', { name: /Test Family/ });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Preview email batch' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm 1 outbox messages' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'selected family changed',
  );
  expect(checkbox).toBeChecked();
  expect(screen.getByText('A reviewed synthetic invitation')).toBeVisible();
});
it('disables already queued families and does not offer a retry or resend for unknown outcomes', async () => {
  const page = await families.list(
    { search: '', sentStatus: '', eventId: '' },
    null,
    new AbortController().signal,
  );
  vi.mocked(families.list).mockResolvedValue({
    ...page,
    data: page.data.map((i) => ({ ...i, emailQueued: true })),
  });
  const unknown = {
    ...confirmed,
    mode: 'resend' as const,
    dispatches: confirmed.dispatches.map((j) => ({
      ...j,
      status: 'unknown' as const,
      errorCode: 'RECONCILIATION_REQUIRED',
    })),
  };
  vi.mocked(api.batches).mockResolvedValue({
    data: [unknown],
    meta: { requestId: 'test', hasMore: false, nextCursor: null },
  });
  vi.mocked(api.getBatch).mockResolvedValue(unknown);
  view();
  expect(
    await screen.findByRole('checkbox', { name: /Test Family/ }),
  ).toBeDisabled();
  fireEvent.click(
    await screen.findByRole('button', { name: /1 families · confirmed/ }),
  );
  await screen.findByText(/The outcome is uncertain/);
  expect(
    screen.queryByRole('button', { name: 'Retry original dispatch' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Verify provider record' }),
  ).toBeVisible();
});
