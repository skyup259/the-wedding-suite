import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import { SignupPage } from './SignupPage.js';
import { LoginPage } from './LoginPage.js';
import { DashboardPage } from './DashboardPage.js';
import { AccessGate } from './AccessGate.js';
import * as api from './api.js';

vi.mock('./api.js', () => ({
  currentUser: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
}));
const identity = {
  user: {
    id: 'user-1',
    displayName: 'Avani',
    email: 'avani@example.test',
    role: 'admin' as const,
  },
  wedding: {
    id: 'wedding-1',
    couple: { partner1Name: 'Avani', partner2Name: 'Swar' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    slug: 'avani-swar-31-12-2026',
    publicationStatus: 'draft' as const,
    themeId: 'traditional' as const,
  },
};
function renderRoute(path = '/signup') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/signup"
            element={
              <AccessGate guest>
                <SignupPage />
              </AccessGate>
            }
          />
          <Route
            path="/login"
            element={
              <AccessGate guest>
                <LoginPage />
              </AccessGate>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AccessGate>
                <DashboardPage />
              </AccessGate>
            }
          />
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
async function accountStep() {
  await screen.findByLabelText('Your name');
  fill('Your name', 'Avani');
  fill('Email address', 'avani@example.test');
  fill('Password', 'a long synthetic passphrase');
  fill('Confirm password', 'a long synthetic passphrase');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Tell us about your wedding.' });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.currentUser).mockResolvedValue(null);
  vi.mocked(api.signup).mockResolvedValue(identity);
  vi.mocked(api.login).mockResolvedValue(identity);
  vi.mocked(api.logout).mockResolvedValue(undefined);
});

describe('authentication screens', () => {
  it('validates password confirmation before advancing or making a signup request', async () => {
    renderRoute();
    await screen.findByLabelText('Your name');
    fill('Your name', 'Avani');
    fill('Email address', 'avani@example.test');
    fill('Password', 'a long synthetic passphrase');
    fill('Confirm password', 'a different passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Passwords must match.'),
    ).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });
  it('submits the two-step signup once without confirmation, then supports logout and private-cache clearing', async () => {
    const client = renderRoute();
    await accountStep();
    expect(api.signup).not.toHaveBeenCalled();
    fill("First partner's name", 'Avani');
    fill("Second partner's name", 'Swar');
    fill('Main wedding date', '2026-12-31');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create wedding workspace' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Avani.' }),
    ).toBeInTheDocument();
    expect(api.signup).toHaveBeenCalledTimes(1);
    expect(api.signup).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmPassword: expect.anything() }),
    );
    client.setQueryData(['private-expenses'], { secret: 'private' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    expect(client.getQueryData(['private-expenses'])).toBeUndefined();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });
  it('shows duplicate email feedback in the account step without losing ordinary form values', async () => {
    vi.mocked(api.signup).mockRejectedValue(
      new ApiClientError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account already uses this email. Sign in instead.',
      ),
    );
    renderRoute();
    await accountStep();
    fill("First partner's name", 'Avani');
    fill("Second partner's name", 'Swar');
    fill('Main wedding date', '2026-12-31');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create wedding workspace' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Email address')).toBeVisible(),
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'avani@example.test',
    );
    expect(
      screen.getAllByText(
        'An account already uses this email. Sign in instead.',
      ).length,
    ).toBeGreaterThan(0);
  });
  it('redirects an anonymous dashboard visit to login and presents authentication failure', async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApiClientError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      ),
    );
    renderRoute('/dashboard');
    await screen.findByRole('heading', { name: 'Welcome back.' });
    fill('Email address', 'avani@example.test');
    fill('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
  });
});
