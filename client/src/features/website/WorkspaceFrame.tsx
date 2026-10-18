import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import { updateSession } from '../auth/hooks.js';
import styles from './website.module.css';
export function WorkspaceFrame({
  title,
  children,
  error,
}: {
  title: string;
  children: ReactNode;
  error?: unknown;
}) {
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 401)
      void updateSession(client, null);
  }, [error, client]);
  return (
    <div>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.brand}>
          The Wedding Suite
        </Link>
        <nav aria-label="Workspace">
          <NavLink to="/dashboard">Overview</NavLink>
          <NavLink to="/website">Website</NavLink>
          <NavLink to="/events">Ceremonies</NavLink>
          <NavLink to="/team">Team</NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Your private wedding workspace</p>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
export function QueryFailure({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      <p>Unable to load this page. Your changes have not been saved.</p>
      <button onClick={retry}>Try again</button>
    </div>
  );
}
