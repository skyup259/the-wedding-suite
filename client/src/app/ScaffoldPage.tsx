import { useQuery } from '@tanstack/react-query';
import { getReadiness } from '../api/health.js';
import styles from './ScaffoldPage.module.css';

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
          The application foundation is ready. Wedding planning and guest
          experiences are coming next.
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
      </div>
    </main>
  );
}
