import { useQuery } from '@tanstack/react-query';
import { getReadiness } from '../api/health.js';
import styles from './ScaffoldPage.module.css';
import { Link } from 'react-router';

export function ScaffoldPage() {
  const readiness = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: ({ signal }) => getReadiness(signal),
  });

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>The Wedding Suite</p>
        <h1>A place for every celebration.</h1>
        <p>
          Your private wedding workspace starts here. Create an account to begin
          planning your celebration.
        </p>
        <div className={styles.status} role="status" aria-live="polite">
          {readiness.isPending && <p>Checking service connection…</p>}
          {readiness.isSuccess && <p>Service connected and ready.</p>}
          {readiness.isError && (
            <>
              <p>Service unavailable. Please try again shortly.</p>
              <button
                type="button"
                onClick={() => {
                  void readiness.refetch();
                }}
              >
                Try again
              </button>
            </>
          )}
        </div>
        <p>
          <Link to="/signup">Create your wedding workspace</Link> ·{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
