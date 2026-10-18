import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Invitation,
  PersonalInvitation,
} from '@wedding-suite/shared/invitations';
import { InvitationsPage } from './InvitationsPage.js';
import { PersonalInvitationPage } from './PersonalInvitationPage.js';
import { ApiClientError } from '../../api/client.js';
import * as api from './api.js';
import * as website from '../website/api.js';
vi.mock('./api.js', () => ({
  list: vi.fn(),
  estimates: vi.fn(),
  save: vi.fn(),
  change: vi.fn(),
  share: vi.fn(),
  detail: vi.fn(),
  personal: vi.fn(),
}));
vi.mock('../website/api.js', () => ({ events: vi.fn(), wedding: vi.fn() }));
const eventId = 'a'.repeat(24),
  id = 'b'.repeat(24),
  token = 'c'.repeat(64),
  instant = '2026-10-18T10:00:00.000Z';
const item: Invitation = {
  id,
  familyDisplayName: 'Test Family',
  contactName: 'Private contact',
  phone: '',
  eventIds: [eventId],
  revision: 1,
  sentStatus: 'not_sent',
  sentAt: null,
  createdAt: instant,
  updatedAt: instant,
  archivedEventIds: [],
};
const event = {
  id: eventId,
  name: 'Mehendi',
  description: '',
  startAt: '2026-12-30T10:00:00.000Z',
  endAt: null,
  venue: { name: 'Garden', address: 'Test venue', mapUrl: '' },
  contacts: [],
  dressCode: '',
  instructions: '',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
  updatedAt: instant,
  revision: 1,
  archivedAt: null,
};
const personal: PersonalInvitation = {
  familyDisplayName: 'Test Family',
  selectedEventIds: [eventId],
  model: {
    wedding: {
      slug: 'test-wedding',
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      website: {
        themeId: 'traditional',
        intro: '',
        welcomeMessage: '',
        accentColor: '#435438',
        coverPhotoId: null,
      },
      latestAnnouncement: null,
    },
    events: [event, { ...event, id: 'd'.repeat(24), name: 'Sangeet' }],
    today: { active: [], next: eventId, overdue: [], localDate: '2026-10-18' },
    updatedAt: instant,
  },
};
function view(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.list).mockResolvedValue({
    data: [item],
    meta: { requestId: 'test', nextCursor: null, hasMore: false },
  });
  vi.mocked(api.estimates).mockResolvedValue({
    kind: 'estimate',
    totalFamilies: 1,
    sentFamilies: 0,
    attendees: { min: 0, max: 0 },
    events: [],
  });
  vi.mocked(website.events).mockResolvedValue([event]);
  vi.mocked(website.wedding).mockResolvedValue({
    ...personal.model.wedding,
    id: 'wedding',
    location: null,
    publicationStatus: 'published',
    revision: 1,
    photoExpiryAt: instant,
    updatedAt: instant,
  });
});
it('retains new family input after save failure and submits selected ceremonies only', async () => {
  vi.mocked(api.save).mockRejectedValue(
    new ApiClientError(
      422,
      'INVALID_EVENT_SELECTION',
      'Choose active ceremonies from your wedding.',
    ),
  );
  view(<InvitationsPage />);
  await screen.findByRole('heading', { name: 'Test Family' });
  fireEvent.click(screen.getByRole('button', { name: 'Add family' }));
  fireEvent.change(screen.getByLabelText('Family display name'), {
    target: { value: 'New Family' },
  });
  fireEvent.change(screen.getByLabelText('Contact name'), {
    target: { value: 'New Contact' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mehendi' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save family' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose active ceremonies',
  );
  expect(screen.getByLabelText('Family display name')).toHaveValue(
    'New Family',
  );
  expect(api.save).toHaveBeenCalledWith(
    {
      familyDisplayName: 'New Family',
      contactName: 'New Contact',
      phone: '',
      eventIds: [eventId],
    },
    undefined,
    undefined,
  );
});
it('retains stale edits and loaded revision until explicit reload discards them', async () => {
  vi.mocked(api.save).mockRejectedValue(
    new ApiClientError(412, 'REVISION_CONFLICT', 'This family changed.'),
  );
  vi.mocked(api.detail).mockResolvedValue({
    ...item,
    revision: 2,
    contactName: 'Saved elsewhere',
  });
  view(<InvitationsPage />);
  await screen.findByRole('heading', { name: 'Test Family' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit family' }));
  fireEvent.change(screen.getByLabelText('Contact name'), {
    target: { value: 'Unsaved contact' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save family' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Contact name')).toHaveValue('Unsaved contact');
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({ contactName: 'Unsaved contact' }),
    id,
    1,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved family (discard edits)' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Contact name')).toHaveValue(
      'Saved elsewhere',
    ),
  );
});
it('sharing does not mark Sent and replacing requires an explicit confirmation', async () => {
  vi.mocked(api.share).mockResolvedValue({
    url: `https://example.test/w/test/invite/${token}`,
    message: 'An invitation',
    whatsappUrl: 'https://wa.me/?text=test',
  });
  vi.mocked(api.change).mockResolvedValue({ ...item, revision: 2 });
  view(<InvitationsPage />);
  await screen.findByRole('heading', { name: 'Test Family' });
  fireEvent.click(screen.getByRole('button', { name: 'Share invitation' }));
  expect(
    await screen.findByLabelText('Invitation link', { exact: true }),
  ).toHaveValue(`https://example.test/w/test/invite/${token}`);
  expect(api.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
  expect(api.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }));
  await screen.findByText(
    'Invitation link replaced. Previous copies no longer work.',
  );
  expect(api.change).toHaveBeenCalledWith(id, 1, 'rotate-link', undefined);
});
it('scrubs the personal token, shows full schedule, and hides cached family content when access is revoked', async () => {
  vi.mocked(api.personal).mockResolvedValue(personal);
  const client = view(
    <Routes>
      <Route path="/" element={<PersonalInvitationPage />} />
    </Routes>,
  );
  // No token route: reopening the original link is required.
  await screen.findByText(
    'Reopen the original invitation link from your message.',
  );
  expect(api.personal).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});
it('loads a personal invitation without putting the token in query cache and removes it after invalidation', async () => {
  vi.mocked(api.personal).mockResolvedValue(personal);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/test-wedding/invite/${token}`]}>
        <Routes>
          <Route
            path="/w/:slug/invite/:token"
            element={<PersonalInvitationPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Dear Test Family,' });
  expect(window.location.pathname).toBe('/w/test-wedding/invite');
  expect(screen.getByRole('heading', { name: 'Sangeet' })).toBeVisible();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  vi.mocked(api.personal).mockRejectedValue(
    new ApiClientError(404, 'NOT_FOUND', 'Invitation not available.'),
  );
  fireEvent.focus(window);
  await screen.findByText(/This invitation may have been replaced/);
  expect(
    screen.queryByRole('heading', { name: 'Dear Test Family,' }),
  ).not.toBeInTheDocument();
});
