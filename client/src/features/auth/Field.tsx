import type { ComponentPropsWithRef } from 'react';
import styles from './auth.module.css';

type Props = ComponentPropsWithRef<'input'> & {
  label: string;
  error?: string | undefined;
  hint?: string;
};
export function Field({ label, error, hint, ...props }: Props) {
  const id = props.id ?? props.name;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
      />
      {error ? (
        <p id={`${id}-error`} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
