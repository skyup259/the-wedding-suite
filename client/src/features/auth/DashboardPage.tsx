import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import { logout } from './api.js';
import { useSession, updateSession } from './hooks.js';
import styles from './auth.module.css';
import { demoMedia } from '../website/demo-media.js';

export function DashboardPage() {
  const { data } = useSession();
  const client = useQueryClient(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      await updateSession(client, null);
      void navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        await updateSession(client, null);
        void navigate('/login', { replace: true });
      } else setError('We couldn’t sign you out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!data) return null;
  const date = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${data.wedding.mainDate}T12:00:00Z`));
  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <span className={styles.brand}>The Wedding Suite</span>
        <div>
          <span>{data.user.displayName}</span>
          <button
            className={styles.secondary}
            onClick={() => {
              void signOut();
            }}
            disabled={busy}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>
      <div className={styles.dashboardBody}>
        <p className={styles.eyebrow}>
          Your private workspace ·{' '}
          {data.user.role === 'admin' ? 'Admin' : 'Manager'}
        </p>
        <h1>Welcome, {data.user.displayName}.</h1>
        <p className={styles.subtitle}>
          A little space to bring your celebration together.
        </p>
        <section className={styles.weddingCard}>
          <div className={styles.weddingDetails}>
            <p className={styles.eyebrow}>Your wedding</p>
            <h2>
              {data.wedding.couple.partner1Name} <span>&</span>{' '}
              {data.wedding.couple.partner2Name}
            </h2>
            <p>
              {date} · {data.wedding.timezone}
            </p>
            <span className={styles.badge}>
              {data.wedding.publicationStatus === 'draft'
                ? 'Website unpublished'
                : 'Website published'}
            </span>
          </div>
          <figure className={styles.planningPhoto}>
            <img
              src={demoMedia.planning}
              alt="Sample wedding courtyard decorated with flowers and lanterns"
              width="512"
              height="286"
            />
            <figcaption>Sample photography</figcaption>
          </figure>
        </section>
        <p>
          <Link to="/website">Manage wedding website</Link> ·{' '}
          <Link to="/events">Manage ceremonies</Link> ·{' '}
          <Link to="/invitations">Manage family invitations</Link>
        </p>
        <p>
          <Link to="/team">
            {data.user.role === 'admin'
              ? 'Manage wedding team'
              : 'View wedding team'}
          </Link>
        </p>
        <section className={styles.nextCard}>
          <h2>You’re all set.</h2>
          <p>
            Your workspace is ready. Add your ceremonies, choose a website
            theme, and preview the guest experience before publishing.
          </p>
        </section>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
