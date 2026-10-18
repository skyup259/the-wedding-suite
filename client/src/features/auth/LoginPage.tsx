import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { loginSchema } from '@wedding-suite/shared/auth';
import type { LoginInput } from '@wedding-suite/shared/auth';
import { useState } from 'react';
import { AuthLayout } from './AuthLayout.js';
import { Field } from './Field.js';
import { login } from './api.js';
import { updateSession } from './hooks.js';
import styles from './auth.module.css';

export function LoginPage() {
  const client = useQueryClient(),
    navigate = useNavigate();
  const [error, setError] = useState('');
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const submit = form.handleSubmit(async (input) => {
    setError('');
    try {
      await updateSession(client, await login(input));
      form.resetField('password');
      void navigate('/dashboard', { replace: true });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Please try again.',
      );
    }
  });
  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to pick up where your plans left off."
    >
      <form onSubmit={submit} noValidate>
        <Field
          label="Email address"
          type="email"
          autoComplete="username"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button
          className={styles.submit}
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className={styles.switch}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className={styles.switch}>
          Planning your wedding? <Link to="/signup">Create a workspace</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
