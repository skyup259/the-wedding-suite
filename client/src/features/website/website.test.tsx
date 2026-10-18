import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Wedding, GuestModel } from '@wedding-suite/shared/website';
import { ApiClientError } from '../../api/client.js';
import { GuestView, PreviewPage } from './GuestPage.js';
import { WebsitePage } from './WebsitePage.js';
import { localInstant, localTime } from './calendar.js';
import * as api from './api.js';
vi.mock('./api.js', () => ({
  wedding: vi.fn(),
  saveWedding: vi.fn(),
  publication: vi.fn(),
  announcement: vi.fn(),
  preview: vi.fn(),
  guest: vi.fn(),
}));
const wedding: Wedding = {
  id: 'w1',
  couple: { partner1Name: 'Avani', partner2Name: 'Swar' },
  mainDate: '2026-12-31',
  timezone: 'Asia/Kolkata',
  slug: 'avani-swar-31-12-2026',
  publicationStatus: 'draft',
  revision: 3,
  photoExpiryAt: '2027-01-07T18:30:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
  website: {
    themeId: 'traditional',
    intro: 'Come celebrate with us.',
    welcomeMessage: 'A day with our favourite people.',
    accentColor: '#435438',
    coverPhotoId: null,
  },
  location: null,
  latestAnnouncement: null,
};
const model: GuestModel = {
  wedding: {
    couple: wedding.couple,
    mainDate: wedding.mainDate,
    timezone: wedding.timezone,
    slug: wedding.slug,
    website: wedding.website,
    latestAnnouncement: null,
  },
  events: [
    {
      id: 'event1',
      name: 'Mehendi',
      description: 'A garden celebration.',
      startAt: '2026-12-30T10:00:00.000Z',
      endAt: null,
      venue: { name: 'Garden', address: 'Test venue address', mapUrl: '' },
      contacts: [{ name: 'Organiser', phone: '+919000000000' }],
      dressCode: 'Festive',
      instructions: '',
      status: 'not_started',
      sortOrder: 0,
      stream: null,
      updatedAt: '2026-10-18T10:00:00.000Z',
    },
  ],
  today: { active: [], next: 'event1', overdue: [], localDate: '2026-10-18' },
  updatedAt: '2026-10-18T10:00:00.000Z',
};
function view(element: React.ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.wedding).mockResolvedValue(wedding);
});
describe('wedding website screens', () => {
  it('returns from publishing to current settings and saves with the published revision', async () => {
    const published: Wedding = {
      ...wedding,
      publicationStatus: 'published',
      revision: 4,
    };
    vi.mocked(api.preview).mockResolvedValue({
      data: model,
      meta: { requestId: 'publish-regression', weddingRevision: 3 },
    });
    vi.mocked(api.publication).mockResolvedValue(published);
    vi.mocked(api.saveWedding).mockResolvedValue({ ...published, revision: 5 });
    view(
      <Routes>
        <Route path="/" element={<WebsitePage />} />
        <Route path="/website" element={<WebsitePage />} />
        <Route path="/website/preview" element={<PreviewPage />} />
      </Routes>,
    );
    await screen.findByText('Draft · private');
    fireEvent.click(
      screen.getByRole('link', { name: 'Preview saved website' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish website' }),
    );
    await screen.findByText('Website published.');
    expect(api.publication).toHaveBeenCalledWith(true, 3);
    // Hold the background GET so it cannot hide stale-cache initialization.
    vi.mocked(api.wedding).mockImplementation(() => new Promise(() => {}));
    fireEvent.click(
      screen.getByRole('link', { name: 'Back to website settings' }),
    );
    expect(await screen.findByText('Published')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Introduction'), {
      target: { value: 'Updated after publishing' },
    });
    vi.mocked(api.wedding).mockResolvedValue({ ...published, revision: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Save website' }));
    await screen.findByText('Website saved. Your changes are now live.');
    expect(api.saveWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        website: expect.objectContaining({ intro: 'Updated after publishing' }),
      }),
      4,
    );
  });
  it.each(['traditional', 'floral', 'minimal'] as const)(
    'renders the same schedule, map and call actions in %s',
    (theme) => {
      const data = {
        ...model,
        wedding: {
          ...model.wedding,
          website: { ...model.wedding.website, themeId: theme },
        },
      };
      const { container } = render(<GuestView model={data} />);
      expect(container.firstChild).toHaveAttribute('data-theme', theme);
      expect(
        screen.getByRole('heading', { name: 'The wedding celebrations' }),
      ).toBeVisible();
      expect(
        screen.getAllByRole('heading', { name: 'Mehendi' }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole('link', { name: 'Call Organiser' }),
      ).toHaveAttribute('href', 'tel:+919000000000');
      expect(
        screen.getByRole('link', { name: /View directions/ }),
      ).toHaveAttribute(
        'href',
        expect.stringContaining('Test%20venue%20address'),
      );
      expect(screen.queryByText(/RSVP/)).not.toBeInTheDocument();
    },
  );
  it('keeps failed edits visible, uses the loaded revision and reloads only when explicitly requested', async () => {
    vi.mocked(api.saveWedding).mockRejectedValue(
      new ApiClientError(
        412,
        'REVISION_CONFLICT',
        'This record changed. Reload the latest version before saving.',
      ),
    );
    view(<WebsitePage />);
    const input = await screen.findByLabelText('Introduction');
    fireEvent.change(input, { target: { value: 'My unsaved message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save website' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This record changed',
    );
    expect(input).toHaveValue('My unsaved message');
    expect(api.saveWedding).toHaveBeenCalledWith(
      expect.objectContaining({
        website: expect.objectContaining({ intro: 'My unsaved message' }),
      }),
      3,
    );
    vi.mocked(api.wedding).mockResolvedValue({
      ...wedding,
      revision: 4,
      website: { ...wedding.website, intro: 'Saved elsewhere' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reload saved version and discard local edits',
      }),
    );
    expect(await screen.findByText('Loaded the saved version.')).toBeVisible();
    expect(input).toHaveValue('Saved elsewhere');
  });
  it('provides a private saved preview and never exposes a publish action in the editor', async () => {
    view(<WebsitePage />);
    await screen.findByLabelText('Introduction');
    expect(
      screen.getByRole('link', { name: 'Preview saved website' }),
    ).toHaveAttribute('href', '/website/preview');
    expect(
      screen.queryByRole('button', { name: 'Publish website' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Draft · private')).toBeVisible();
  });
  it('converts times using the wedding timezone and rejects DST gaps/ambiguities', () => {
    expect(localInstant('2026-12-30T15:30', 'Asia/Kolkata')).toBe(
      '2026-12-30T10:00:00.000Z',
    );
    expect(localTime('2026-12-30T10:00:00.000Z', 'Asia/Kolkata')).toBe(
      '2026-12-30T15:30',
    );
    expect(() => localInstant('2026-03-08T02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(() => localInstant('2026-11-01T01:30', 'America/New_York')).toThrow(
      'occurs twice',
    );
  });
});
