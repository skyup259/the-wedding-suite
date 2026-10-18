import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { passwordSchema } from '@wedding-suite/shared/auth';
import { linkTokenSchema } from '@wedding-suite/shared/access';
import { AuthLayout } from '../auth/AuthLayout.js';
import { Field } from '../auth/Field.js';
import { updateSession } from '../auth/hooks.js';
import { acceptManager, confirmReset } from './api.js';
import styles from '../auth/auth.module.css';
const schema = z
  .object({
    displayName: z.string().trim().max(100),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  });
export function LinkPage({ manager = false }: { manager?: boolean }) {
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  const [error, setError] = useState(''),
    [done, setDone] = useState(false),
    client = useQueryClient(),
    navigate = useNavigate();
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
  }, []);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', password: '', confirmPassword: '' },
  });
  const submit = form.handleSubmit(async (input) => {
    if (manager && !input.displayName) {
      form.setError('displayName', { message: 'Enter your name.' });
      form.setFocus('displayName');
      return;
    }
    setError('');
    try {
      if (manager) {
        const identity = await acceptManager(
          token,
          input.displayName,
          input.password,
        );
        await updateSession(client, identity);
        setToken('');
        form.reset();
        void navigate('/dashboard', { replace: true });
      } else {
        await confirmReset(token, input.password);
        await updateSession(client, null);
        setToken('');
        form.reset();
        setDone(true);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to use this link. Please try again.',
      );
    }
  });
  const valid = linkTokenSchema.safeParse(token).success;
  return (
    <AuthLayout
      title={manager ? 'Join the wedding team.' : 'Choose a new password.'}
      subtitle={
        manager
          ? 'Set up your Manager account to help with the celebration.'
          : 'Your other sessions will be signed out when you reset your password.'
      }
    >
      {done ? (
        <p role="status">Password updated. Sign in with your new password.</p>
      ) : !valid ? (
        <p role="alert">
          This link is missing or invalid.{' '}
          {manager
            ? 'Ask the wedding Admin to resend your invitation.'
            : 'Request a new password reset link.'}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          {manager && (
            <Field
              label="Your name"
              autoComplete="name"
              {...form.register('displayName')}
              error={form.formState.errors.displayName?.message}
            />
          )}
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="Use 15–128 characters. Spaces and pasted passwords are welcome."
            {...form.register('password')}
            error={form.formState.errors.password?.message}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
            error={form.formState.errors.confirmPassword?.message}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            disabled={form.formState.isSubmitting}
            className={styles.submit}
          >
            {form.formState.isSubmitting
              ? 'Saving…'
              : manager
                ? 'Accept invitation'
                : 'Reset password'}
          </button>
        </form>
      )}
      <p className={styles.switch}>
        <Link to="/login">Sign in</Link>
        {!manager && !done && (
          <>
            {' '}
            · <Link to="/forgot-password">Request a new link</Link>
          </>
        )}
      </p>
    </AuthLayout>
  );
}
