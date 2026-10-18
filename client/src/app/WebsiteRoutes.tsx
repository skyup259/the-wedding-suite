import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
const WebsitePage = lazy(() =>
  import('../features/website/WebsitePage.js').then((m) => ({
    default: m.WebsitePage,
  })),
);
const EventsPage = lazy(() =>
  import('../features/website/EventsPage.js').then((m) => ({
    default: m.EventsPage,
  })),
);
const GuestPage = lazy(() =>
  import('../features/website/GuestPage.js').then((m) => ({
    default: m.GuestPage,
  })),
);
const PreviewPage = lazy(() =>
  import('../features/website/GuestPage.js').then((m) => ({
    default: m.PreviewPage,
  })),
);
function Pending({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main role="status" style={{ padding: '2rem' }}>
          Loading…
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
export function WebsiteRoute() {
  return (
    <Pending>
      <WebsitePage />
    </Pending>
  );
}
export function EventsRoute() {
  return (
    <Pending>
      <EventsPage />
    </Pending>
  );
}
export function GuestRoute() {
  return (
    <Pending>
      <GuestPage />
    </Pending>
  );
}
export function PreviewRoute() {
  return (
    <Pending>
      <PreviewPage />
    </Pending>
  );
}
