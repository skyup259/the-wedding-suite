import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { PersonalInvitation } from '@wedding-suite/shared/invitations';
import { ApiClientError } from '../../api/client.js';
import { GuestView } from '../website/GuestPage.js';
import * as api from './api.js';
import styles from './invitations.module.css';
export function PersonalInvitationPage() {
  const { slug = '', token: routeToken = '' } = useParams();
  const [token] = useState(routeToken);
  const [result, setResult] = useState<{
    data: PersonalInvitation | null;
    error: string;
    pending: boolean;
  }>({ data: null, error: '', pending: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Keep the capability only in this component, never in storage/query keys.
    if (routeToken)
      window.history.replaceState(
        window.history.state,
        '',
        `/w/${encodeURIComponent(slug)}/invite`,
      );
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
    return () => robots.remove();
  }, [slug, routeToken]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true,
      running = false;
    const load = async () => {
      if (running || document.visibilityState === 'hidden') return;
      if (!token) {
        setResult({
          data: null,
          error: 'Reopen the original invitation link from your message.',
          pending: false,
        });
        return;
      }
      running = true;
      try {
        const data = await api.personal(slug, token, controller.signal);
        if (active) setResult({ data, error: '', pending: false });
      } catch (e) {
        if (active)
          setResult((previous) => ({
            data:
              e instanceof ApiClientError && e.status === 404
                ? null
                : previous.data,
            error:
              e instanceof ApiClientError && e.status === 404
                ? 'This invitation may have been replaced, archived, or its wedding website unpublished. Ask the organising team for the current link.'
                : 'Unable to refresh this invitation. Please try again.',
            pending: false,
          }));
      } finally {
        running = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 25000);
    const onReturn = () => {
      void load();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [slug, token, attempt]);
  return (
    <>
      {result.error && (
        <div className={styles.personal} role="alert">
          <h1>
            {result.data
              ? 'Unable to refresh invitation'
              : 'Invitation not available'}
          </h1>
          <p>{result.error}</p>
          {result.data && (
            <p>Showing the last successfully loaded invitation.</p>
          )}
          <button onClick={() => setAttempt((v) => v + 1)}>Try again</button>
        </div>
      )}
      {result.pending && (
        <p role="status" className={styles.personal}>
          Opening your invitation…
        </p>
      )}
      {result.data && (
        <GuestView
          model={result.data.model}
          invitation={{
            familyDisplayName: result.data.familyDisplayName,
            selectedEventIds: result.data.selectedEventIds,
          }}
        />
      )}
    </>
  );
}
