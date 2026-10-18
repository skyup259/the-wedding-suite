import { Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { useSession } from './hooks.js';
import styles from './auth.module.css';

export function AccessGate({
  children,
  guest = false,
}: {
  children: ReactNode;
  guest?: boolean;
}) {
  const session = useSession();
  if (session.isPending)
    return (
      <main className={styles.wait} role="status">
        Opening your workspace…
      </main>
    );
  if (session.isError)
    return (
      <main className={styles.wait}>
        <p role="alert">We couldn't connect to your workspace.</p>
        <button
          onClick={() => {
            void session.refetch();
          }}
        >
          Try again
        </button>
      </main>
    );
  if (guest && session.data) return <Navigate to="/dashboard" replace />;
  if (!guest && !session.data) return <Navigate to="/login" replace />;
  return children;
}
