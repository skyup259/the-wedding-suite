import {
  WebsiteRoute,
  EventsRoute,
  GuestRoute,
  PreviewRoute,
} from './WebsiteRoutes.js';
import { TeamPage } from '../features/access/TeamPage.js';
import { RecoveryPage } from '../features/access/RecoveryPage.js';
import { LinkPage } from '../features/access/LinkPage.js';
import { createBrowserRouter } from 'react-router';
import { ScaffoldPage } from './ScaffoldPage.js';
import { NotFoundPage } from './NotFoundPage.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { SignupPage } from '../features/auth/SignupPage.js';
import { DashboardPage } from '../features/auth/DashboardPage.js';
import { AccessGate } from '../features/auth/AccessGate.js';

export const router = createBrowserRouter([
  { path: '/', element: <ScaffoldPage /> },
  {
    path: '/login',
    element: (
      <AccessGate guest>
        <LoginPage />
      </AccessGate>
    ),
  },
  {
    path: '/signup',
    element: (
      <AccessGate guest>
        <SignupPage />
      </AccessGate>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <AccessGate>
        <DashboardPage />
      </AccessGate>
    ),
  },
  {
    path: '/team',
    element: (
      <AccessGate>
        <TeamPage />
      </AccessGate>
    ),
  },
  { path: '/forgot-password', element: <RecoveryPage /> },
  { path: '/reset-password', element: <LinkPage /> },
  { path: '/accept-invitation', element: <LinkPage manager /> },
  {
    path: '/website',
    element: (
      <AccessGate>
        <WebsiteRoute />
      </AccessGate>
    ),
  },
  {
    path: '/events',
    element: (
      <AccessGate>
        <EventsRoute />
      </AccessGate>
    ),
  },
  {
    path: '/website/preview',
    element: (
      <AccessGate>
        <PreviewRoute />
      </AccessGate>
    ),
  },
  { path: '/w/:slug', element: <GuestRoute /> },
  { path: '*', element: <NotFoundPage /> },
]);
