import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetRequestSchema } from '@wedding-suite/shared/access';
import { AuthLayout } from '../auth/AuthLayout.js';
import { Field } from '../auth/Field.js';
import { requestReset } from './api.js';
import styles from '../auth/auth.module.css';
export function RecoveryPage() {
  const [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });
  const submit = form.handleSubmit(async ({ email }) => {
    setError('');
    try {
      await requestReset(email);
      setSent(true);
      form.reset();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to request a reset. Please try again.',
      );
    }
  });
  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="We’ll help you get back to your wedding workspace."
    >
      {sent ? (
        <p role="status">
          If an active account matches, password reset instructions will be
          sent. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <Field
            label="Email address"
            type="email"
            autoComplete="username"
            {...form.register('email')}
            error={form.formState.errors.email?.message}
          />
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <button
            className={styles.submit}
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? 'Requesting…'
              : 'Send reset instructions'}
          </button>
        </form>
      )}
      <p className={styles.switch}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
