import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { emailSchema } from '@wedding-suite/shared/auth';
import { useSession, updateSession } from '../auth/hooks.js';
import { Field } from '../auth/Field.js';
import { ApiClientError } from '../../api/client.js';
import * as api from './api.js';
import styles from '../auth/auth.module.css';
import teamStyles from './team.module.css';
const formSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().max(100),
});
const deliveryLabels = {
  queued: 'Email queued',
  running: 'Email sending',
  accepted: 'Email accepted by provider',
  outbox: 'Saved to local outbox',
  failed: 'Email failed — resend to retry',
  cancelled: 'Email cancelled',
};
export function TeamPage() {
  const { data: identity } = useSession(),
    admin = identity?.user.role === 'admin',
    client = useQueryClient();
  const members = useInfiniteQuery({
    queryKey: ['team', 'members'],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.members(signal, pageParam),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    retry: false,
  });
  const invites = useInfiniteQuery({
    queryKey: ['team', 'invitations'],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.invitations(signal, pageParam),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: admin,
    retry: false,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (
      [members.error, invites.error].some(
        (e) => e instanceof ApiClientError && e.status === 401,
      )
    )
      void updateSession(client, null);
  }, [members.error, invites.error, client]);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', displayName: '' },
  });
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      await client.invalidateQueries({ queryKey: ['team'] });
      return true;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(e instanceof Error ? e.message : 'Unable to save. Try again.');
      if (e instanceof ApiClientError && e.status === 412)
        await client.invalidateQueries({ queryKey: ['team'] });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const submit = form.handleSubmit(async (input) => {
    if (
      await run(
        () => api.invite(input.email, input.displayName),
        'Invitation queued. Check its email status below.',
      )
    )
      form.reset();
  });
  return (
    <div>
      <header className={styles.dashboardHeader}>
        <Link to="/dashboard" className={styles.brand}>
          The Wedding Suite
        </Link>
        <Link to="/dashboard">Back to dashboard</Link>
      </header>
      <main className={styles.dashboardBody}>
        <p className={styles.eyebrow}>Your private workspace</p>
        <h1>Wedding team</h1>
        <p className={styles.subtitle}>
          {admin
            ? 'Invite people you trust to help manage your wedding. Only you can change team access.'
            : 'Your organising team. Contact the Admin for access changes.'}
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {admin && (
          <section className={teamStyles.panel}>
            <h2>Invite a Manager</h2>
            <p>
              Managers can help with wedding planning. They cannot invite people
              or change team access.
            </p>
            <form onSubmit={submit} noValidate>
              <div className={styles.pair}>
                <Field
                  label="Manager email"
                  type="email"
                  autoComplete="off"
                  {...form.register('email')}
                  error={form.formState.errors.email?.message}
                />
                <Field
                  label="Manager name (optional)"
                  autoComplete="off"
                  {...form.register('displayName')}
                  error={form.formState.errors.displayName?.message}
                />
              </div>
              <button disabled={busy || form.formState.isSubmitting}>
                Send invitation
              </button>
            </form>
          </section>
        )}
        <section className={teamStyles.panel}>
          <h2>Team members</h2>
          {members.isPending ? (
            <p role="status">Loading team…</p>
          ) : members.isError ? (
            <div role="alert">
              <p>Unable to load team members.</p>
              <button
                onClick={() => {
                  void members.refetch();
                }}
              >
                Try again
              </button>
            </div>
          ) : (
            <ul className={teamStyles.list}>
              {members.data.pages
                .flatMap((p) => p.data)
                .map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.displayName}</strong>
                      <p>
                        {m.role === 'admin' ? 'Admin' : 'Manager'} · {m.status}
                        {m.email && <> · {m.email}</>}
                      </p>
                    </div>
                    {admin && m.role === 'manager' && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => {
                          void run(
                            () =>
                              api.changeMember(
                                m.id,
                                m.revision,
                                m.status === 'active' ? 'disabled' : 'active',
                              ),
                            m.status === 'active'
                              ? 'Manager disabled. Existing sessions have been revoked.'
                              : 'Manager enabled. They can sign in again.',
                          );
                        }}
                      >
                        {m.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {members.hasNextPage && (
            <button
              disabled={members.isFetchingNextPage}
              onClick={() => {
                void members.fetchNextPage();
              }}
            >
              Load more members
            </button>
          )}
        </section>
        {admin && (
          <section className={teamStyles.panel}>
            <h2>Invitations</h2>
            {invites.isPending ? (
              <p role="status">Loading invitations…</p>
            ) : invites.isError ? (
              <div role="alert">
                <p>Unable to load invitations.</p>
                <button
                  onClick={() => {
                    void invites.refetch();
                  }}
                >
                  Try again
                </button>
              </div>
            ) : !invites.data.pages.flatMap((p) => p.data).length ? (
              <p>No invitations yet.</p>
            ) : (
              <ul className={teamStyles.list}>
                {invites.data.pages
                  .flatMap((p) => p.data)
                  .map((i) => (
                    <li key={i.id}>
                      <div>
                        <strong>{i.displayName ?? i.email}</strong>
                        {i.displayName && <p>{i.email}</p>}
                        <p>
                          {i.status} · {deliveryLabels[i.delivery]}
                        </p>
                        <p>
                          Expires{' '}
                          {new Intl.DateTimeFormat('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone:
                              identity?.wedding.timezone ?? 'Asia/Kolkata',
                          }).format(new Date(i.expiresAt))}
                        </p>
                      </div>
                      {['pending', 'expired'].includes(i.status) && (
                        <div className={teamStyles.actions}>
                          <button
                            disabled={busy}
                            className={styles.secondary}
                            onClick={() => {
                              void run(
                                () => api.resend(i.id, i.revision),
                                'Replacement invitation queued. The previous link is invalid.',
                              );
                            }}
                          >
                            Resend
                          </button>
                          <button
                            disabled={busy}
                            className={styles.secondary}
                            onClick={() => {
                              void run(
                                () => api.revoke(i.id, i.revision),
                                'Invitation revoked.',
                              );
                            }}
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {invites.hasNextPage && (
              <button
                disabled={invites.isFetchingNextPage}
                onClick={() => {
                  void invites.fetchNextPage();
                }}
              >
                Load more invitations
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
