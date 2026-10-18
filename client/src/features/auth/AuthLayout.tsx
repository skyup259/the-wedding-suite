import { Link } from 'react-router';
import type { ReactNode } from 'react';
import styles from './auth.module.css';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.layout}>
      <aside className={styles.story}>
        <Link className={styles.brand} to="/">
          The Wedding Suite<span>FOR EVERY CELEBRATION</span>
        </Link>
        <div className={styles.storyBody}>
          <p className={styles.eyebrow}>
            A little planning. A lifetime of memories.
          </p>
          <h2>
            More joy.
            <br />
            Less juggling.
          </h2>
          <p>
            Bring your wedding plans, your family, and every small detail
            together in one thoughtful place.
          </p>
          <div className={styles.flower} aria-hidden="true">
            ✳
          </div>
        </div>
        <p className={styles.footerNote}>
          Made for celebrations. Designed around you.
        </p>
      </aside>
      <section className={styles.formSection} aria-labelledby="auth-heading">
        <div className={styles.formCard}>
          <Link to="/" className={styles.mobileBrand}>
            The Wedding Suite
          </Link>
          <p className={styles.eyebrow}>Your private wedding workspace</p>
          <h1 id="auth-heading">{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
