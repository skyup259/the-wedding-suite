import { Link } from 'react-router';
import styles from './ScaffoldPage.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>The Wedding Suite</p>
        <h1>Page not found.</h1>
        <p>The page you are looking for is unavailable.</p>
        <Link to="/">Return home</Link>
      </div>
    </main>
  );
}
