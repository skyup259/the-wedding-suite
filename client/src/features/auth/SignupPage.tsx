import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registerSchema } from '@wedding-suite/shared/auth';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import { AuthLayout } from './AuthLayout.js';
import { Field } from './Field.js';
import { signup } from './api.js';
import { updateSession } from './hooks.js';
import styles from './auth.module.css';

const formSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match.',
  });
type FormValues = z.infer<typeof formSchema>;
export function SignupPage() {
  const [step, setStep] = useState(1),
    [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const client = useQueryClient(),
    navigate = useNavigate();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      wedding: {
        couple: { partner1Name: '', partner2Name: '' },
        mainDate: '',
        timezone: 'Asia/Kolkata',
        themeId: 'traditional',
      },
    },
  });
  async function next() {
    if (
      await form.trigger(
        ['displayName', 'email', 'password', 'confirmPassword'],
        { shouldFocus: true },
      )
    ) {
      setStep(2);
      setError('');
      requestAnimationFrame(() => heading.current?.focus());
    }
  }
  const submit = form.handleSubmit(
    async (values) => {
      setError('');
      try {
        const input = registerSchema.parse({
          email: values.email,
          password: values.password,
          displayName: values.displayName,
          wedding: values.wedding,
        });
        await updateSession(client, await signup(input));
        form.reset();
        void navigate('/dashboard', { replace: true });
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === 'EMAIL_ALREADY_REGISTERED'
        ) {
          setStep(1);
          form.setError(
            'email',
            { message: error.message },
            { shouldFocus: true },
          );
        }
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to create your workspace. Please try again.',
        );
      }
    },
    () => {
      setError('Please check the highlighted fields.');
    },
  );
  return (
    <AuthLayout
      title="Your celebration starts here."
      subtitle="Create one private workspace for you and your wedding team."
    >
      <ol className={styles.steps} aria-label="Signup progress">
        <li aria-current={step === 1 ? 'step' : undefined}>1 · Your account</li>
        <li aria-current={step === 2 ? 'step' : undefined}>2 · Your wedding</li>
      </ol>
      <form
        onSubmit={(event) => {
          if (step === 1) {
            event.preventDefault();
            void next();
          } else void submit(event);
        }}
        noValidate
      >
        <h2 className={styles.stepTitle} tabIndex={-1} ref={heading}>
          {step === 1
            ? 'First, a little about you.'
            : 'Tell us about your wedding.'}
        </h2>
        <div hidden={step !== 1}>
          <Field
            label="Your name"
            autoComplete="name"
            {...form.register('displayName')}
            error={form.formState.errors.displayName?.message}
          />
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
            autoComplete="new-password"
            {...form.register('password')}
            error={form.formState.errors.password?.message}
            hint="Use 15–128 characters. A memorable passphrase works well."
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
            error={form.formState.errors.confirmPassword?.message}
          />
        </div>
        <div hidden={step !== 2}>
          <div className={styles.pair}>
            <Field
              label="First partner's name"
              {...form.register('wedding.couple.partner1Name')}
              error={
                form.formState.errors.wedding?.couple?.partner1Name?.message
              }
            />
            <Field
              label="Second partner's name"
              {...form.register('wedding.couple.partner2Name')}
              error={
                form.formState.errors.wedding?.couple?.partner2Name?.message
              }
            />
          </div>
          <Field
            label="Main wedding date"
            type="date"
            {...form.register('wedding.mainDate')}
            error={form.formState.errors.wedding?.mainDate?.message}
          />
          <Field
            label="Wedding timezone"
            list="timezones"
            {...form.register('wedding.timezone')}
            error={form.formState.errors.wedding?.timezone?.message}
            hint="Dates and ceremony times will use this timezone."
          />
          <datalist id="timezones">
            <option value="Asia/Kolkata" />
            <option value="Asia/Dubai" />
            <option value="Europe/London" />
            <option value="America/New_York" />
          </datalist>
          <p className={styles.hint}>
            You’ll be the Admin. Your wedding website stays private until you
            publish it.
          </p>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          {step === 2 && (
            <button
              type="button"
              className={styles.secondary}
              disabled={form.formState.isSubmitting}
              onClick={() => {
                setStep(1);
                setError('');
              }}
            >
              Back
            </button>
          )}
          <button
            className={styles.submit}
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? 'Creating your workspace…'
              : step === 1
                ? 'Continue'
                : 'Create wedding workspace'}
          </button>
        </div>
        <p className={styles.switch}>
          Already have a workspace? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
