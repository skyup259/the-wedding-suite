import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoveryPage } from './RecoveryPage.js';
import { LinkPage } from './LinkPage.js';
import { TeamPage } from './TeamPage.js';
import * as api from './api.js';
import { useSession, updateSession } from '../auth/hooks.js';
vi.mock('./api.js', () => ({
  requestReset: vi.fn(),
  confirmReset: vi.fn(),
  acceptManager: vi.fn(),
  members: vi.fn(),
  invitations: vi.fn(),
  invite: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  changeMember: vi.fn(),
}));
vi.mock('../auth/hooks.js', () => ({
  useSession: vi.fn(),
  updateSession: vi.fn(),
}));
const identity = {
  user: {
    id: 'admin',
    displayName: 'Admin',
    email: 'admin@example.test',
    role: 'admin' as const,
  },
  wedding: {
    id: 'wedding',
    couple: { partner1Name: 'A', partner2Name: 'B' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    slug: 'a-b',
    publicationStatus: 'draft' as const,
    themeId: 'traditional' as const,
  },
};
function view(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={element} />
          <Route path="/dashboard" element={<p>Manager dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  vi.mocked(useSession).mockReturnValue({ data: identity } as ReturnType<
    typeof useSession
  >);
  vi.mocked(api.members).mockResolvedValue({
    data: [
      {
        id: 'admin',
        displayName: 'Admin',
        email: 'admin@example.test',
        role: 'admin',
        status: 'active',
        revision: 1,
      },
      {
        id: 'manager',
        displayName: 'Manager',
        email: 'manager@example.test',
        role: 'manager',
        status: 'active',
        revision: 3,
      },
    ],
    meta: { requestId: 'test', nextCursor: null, hasMore: false },
  });
  vi.mocked(api.invitations).mockResolvedValue({
    data: [],
    meta: { requestId: 'test', nextCursor: null, hasMore: false },
  });
});
describe('team and recovery screens', () => {
  it('validates recovery email and shows generic completion', async () => {
    vi.mocked(api.requestReset).mockResolvedValue(undefined);
    view(<RecoveryPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Send reset instructions' }),
    );
    await screen.findByRole('alert');
    expect(api.requestReset).not.toHaveBeenCalled();
    fill('Email address', 'unknown@example.test');
    fireEvent.click(
      screen.getByRole('button', { name: 'Send reset instructions' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an active account matches',
    );
    expect(api.requestReset).toHaveBeenCalledWith('unknown@example.test');
  });
  it('scrubs the link fragment, validates confirmation, resets and clears private session data', async () => {
    const token = 'a'.repeat(64);
    window.history.replaceState(null, '', `/reset-password#token=${token}`);
    vi.mocked(api.confirmReset).mockResolvedValue(undefined);
    const client = view(<LinkPage />);
    expect(window.location.hash).toBe('');
    fill('New password', 'a long synthetic passphrase');
    fill('Confirm password', 'a different passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passwords must match',
    );
    expect(api.confirmReset).not.toHaveBeenCalled();
    fill('Confirm password', 'a long synthetic passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password updated',
    );
    expect(api.confirmReset).toHaveBeenCalledWith(
      token,
      'a long synthetic passphrase',
    );
    expect(updateSession).toHaveBeenCalledWith(client, null);
  });
  it('accepts Manager setup and transitions to the signed-in dashboard', async () => {
    const token = 'b'.repeat(64);
    window.history.replaceState(null, '', `/accept-invitation#token=${token}`);
    const manager = {
      ...identity,
      user: { ...identity.user, id: 'manager', role: 'manager' as const },
    };
    vi.mocked(api.acceptManager).mockResolvedValue(manager);
    const client = view(<LinkPage manager />);
    fill('Your name', 'Test Manager');
    fill('New password', 'a long synthetic passphrase');
    fill('Confirm password', 'a long synthetic passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('Manager dashboard');
    expect(api.acceptManager).toHaveBeenCalledWith(
      token,
      'Test Manager',
      'a long synthetic passphrase',
    );
    expect(updateSession).toHaveBeenCalledWith(client, manager);
  });
  it('presents invalid links without sending a capability exchange', () => {
    view(<LinkPage manager />);
    expect(screen.getByRole('alert')).toHaveTextContent('missing or invalid');
    expect(
      screen.queryByRole('button', { name: 'Accept invitation' }),
    ).not.toBeInTheDocument();
    expect(api.acceptManager).not.toHaveBeenCalled();
  });
  it('sends an invitation, shows queue feedback and uses the member revision on disable', async () => {
    vi.mocked(api.invite).mockResolvedValue(undefined);
    vi.mocked(api.changeMember).mockResolvedValue(undefined);
    view(<TeamPage />);
    await screen.findByText('Manager', { exact: true });
    fill('Manager email', 'new@example.test');
    fill('Manager name (optional)', 'Test Person');
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await screen.findByText('Invitation queued. Check its email status below.');
    expect(api.invite).toHaveBeenCalledWith('new@example.test', 'Test Person');
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(api.changeMember).toHaveBeenCalledWith('manager', 3, 'disabled'),
    );
  });
  it('hides team-access controls from Managers and does not load invitation contacts', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { ...identity, user: { ...identity.user, role: 'manager' } },
    } as ReturnType<typeof useSession>);
    vi.mocked(api.members).mockResolvedValue({
      data: [
        {
          id: 'admin',
          displayName: 'Admin',
          role: 'admin',
          status: 'active',
          revision: 1,
        },
      ],
      meta: { requestId: 'test', nextCursor: null, hasMore: false },
    });
    view(<TeamPage />);
    await screen.findByText('Admin', { exact: true });
    expect(screen.queryByLabelText('Manager email')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disable' }),
    ).not.toBeInTheDocument();
    expect(api.invitations).not.toHaveBeenCalled();
    expect(screen.queryByText('admin@example.test')).not.toBeInTheDocument();
  });
});
