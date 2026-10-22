import { useState } from 'react';
import { Link } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  EmailBatch,
  EmailDispatch,
} from '@wedding-suite/shared/campaigns';
import { WorkspaceFrame, QueryFailure } from '../website/WorkspaceFrame.js';
import { ApiClientError } from '../../api/client.js';
import { updateSession } from '../auth/hooks.js';
import * as families from './api.js';
import * as api from './campaign-api.js';
import styles from './invitations.module.css';
export function EmailBatchesPage() {
  const client = useQueryClient(),
    [selected, setSelected] = useState<string[]>([]),
    [batch, setBatch] = useState<EmailBatch | null>(null),
    [batchId, setBatchId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['invitations', 'email-families'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      families.list(
        { search: '', sentStatus: '', eventId: '' },
        pageParam,
        signal,
      ),
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
    retry: false,
  });
  const history = useInfiniteQuery({
    queryKey: ['invitations', 'email-batches'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => api.batches(pageParam, signal),
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
    retry: false,
  });
  const live = useQuery({
    queryKey: ['invitations', 'email-batch', batchId],
    queryFn: ({ signal }) => api.getBatch(batchId!, signal),
    enabled: Boolean(batchId),
    retry: false,
    refetchInterval: 5000,
    refetchOnWindowFocus: 'always',
  });
  const current = live.data ?? batch,
    failure = list.error ?? history.error ?? live.error;
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(
        e instanceof Error ? e.message : 'Unable to complete email action.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['invitations'] });
  }
  return (
    <WorkspaceFrame title="Family email invitations" error={failure}>
      <p>
        <Link to="/invitations">Back to families</Link>
      </p>
      <p>
        Choose up to 25 families, review each recipient and message, then
        confirm once. Explicit resends are disabled; safe retries keep the
        original recipient and message.
      </p>
      <p className={styles.callout}>
        Outbox batches create local test messages only. Live batches send
        individually addressed emails through Resend. Sent means provider
        accepted; delivery is tracked separately and requires configured
        webhooks. The daily allowance counts confirmed new-family reservations,
        including failed or cancelled sends.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.callout}>
          {notice}
        </p>
      )}
      {failure && (
        <QueryFailure
          retry={() => {
            void refresh();
          }}
        />
      )}
      <section className={styles.panel}>
        <h2>Select families</h2>
        <p>
          {selected.length} of 25 selected. Add or correct contact emails on the
          family editor before preparing a preview.
        </p>
        {list.isPending && <p role="status">Loading families…</p>}
        {list.data?.pages
          .flatMap((p) => p.data)
          .map((i) => (
            <label className={styles.check} key={i.id}>
              <input
                type="checkbox"
                checked={selected.includes(i.id)}
                disabled={
                  busy ||
                  !i.email ||
                  i.emailQueued ||
                  (selected.length >= 25 && !selected.includes(i.id))
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i.id]
                      : selected.filter((id) => id !== i.id),
                  )
                }
              />
              <span>
                {i.familyDisplayName} · {i.email || 'No contact email'}
                {i.emailQueued ? ' · Original dispatch already queued' : ''}
              </span>
            </label>
          ))}
        {list.hasNextPage && (
          <button
            disabled={list.isFetchingNextPage}
            className={styles.secondary}
            onClick={() => {
              void list.fetchNextPage();
            }}
          >
            Load more families
          </button>
        )}
        <div className={styles.toolbar}>
          <button
            disabled={busy || !selected.length}
            onClick={() => {
              void act(async () => {
                setBatchId(null);
                setBatch(await api.previewEmail(selected));
                await history.refetch();
              });
            }}
          >
            Preview email batch
          </button>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              setSelected([]);
              setBatch(null);
              setBatchId(null);
            }}
          >
            Clear selection
          </button>
        </div>
      </section>
      {current && (
        <section className={styles.panel} aria-label="Email batch review">
          <h2>
            {current.status === 'preview'
              ? 'Review before sending'
              : 'Batch results'}
          </h2>
          <p>
            Mode:{' '}
            <strong>
              {current.mode === 'outbox'
                ? 'Private local outbox'
                : 'Live Resend'}
            </strong>{' '}
            · {current.status}
          </p>
          <p>
            {current.quota.firstRemaining} new-family reservations remaining for{' '}
            {current.quota.day} ({current.quota.timezone}). This email-day
            timezone is fixed when the first batch is confirmed.
          </p>
          {current.status === 'preview' ? (
            <>
              <p>
                Preview expires {new Date(current.expiresAt).toLocaleString()}.
                Changes to families or wedding content require a new preview.
              </p>
              {current.items.map((i) => (
                <article
                  className={`${styles.card} ${styles.mailCard}`}
                  key={i.invitationId}
                >
                  <div>
                    <h3>To: {i.to ?? 'Preview expired'}</h3>
                    <p>{i.subject}</p>
                    <pre className={styles.message}>
                      {i.text ??
                        'Prepare a fresh preview to review this message.'}
                    </pre>
                  </div>
                </article>
              ))}
              <button
                disabled={busy || current.items.some((item) => !item.text)}
                onClick={() => {
                  void act(async () => {
                    const result = await api.confirmBatch(
                      current.id,
                      current.revision,
                    );
                    setBatch(result);
                    setBatchId(result.id);
                    setSelected([]);
                    setNotice(
                      result.mode === 'outbox'
                        ? 'Batch confirmed for private outbox testing. No real email is sent.'
                        : 'Batch confirmed. Individual emails are queued.',
                    );
                    await refresh();
                  });
                }}
              >
                Confirm {current.items.length}{' '}
                {current.mode === 'outbox' ? 'outbox messages' : 'emails'}
              </button>
            </>
          ) : (
            <>
              <p>
                Refresh updates every five seconds. Provider acceptance is not a
                delivery guarantee; bounces remain flagged for follow-up.
              </p>
              {current.dispatches.map((j) => (
                <Dispatch
                  key={j.id}
                  job={j}
                  disabled={busy}
                  perform={(work) => {
                    void act(async () => {
                      await work();
                      await refresh();
                    });
                  }}
                />
              ))}
              <button
                className={styles.secondary}
                onClick={() => {
                  void live.refetch();
                }}
              >
                Refresh results
              </button>
            </>
          )}
        </section>
      )}
      <section className={styles.panel}>
        <h2>Recent batches</h2>
        {history.data?.pages
          .flatMap((p) => p.data)
          .map((b) => (
            <p key={b.id}>
              <button
                className={styles.secondary}
                disabled={busy}
                onClick={() => {
                  setBatch(null);
                  setBatchId(b.id);
                }}
              >
                {new Date(b.createdAt).toLocaleString()} · {b.items.length}{' '}
                families · {b.status} · {b.mode}
              </button>
            </p>
          ))}
        {history.hasNextPage && (
          <button
            onClick={() => {
              void history.fetchNextPage();
            }}
          >
            Load more batches
          </button>
        )}
      </section>
    </WorkspaceFrame>
  );
}
function Dispatch({
  job,
  disabled,
  perform,
}: {
  job: EmailDispatch;
  disabled: boolean;
  perform: (work: () => Promise<unknown>) => void;
}) {
  const [providerId, setProviderId] = useState('');
  return (
    <article className={styles.card}>
      <div>
        <h3>{job.familyDisplayName}</h3>
        <p>
          Status: {job.status} · Delivery: {job.delivery} · Attempts:{' '}
          {job.attempts}
        </p>
        {job.errorCode && <p>{job.errorCode.replaceAll('_', ' ')}</p>}
        {job.status === 'outbox' && (
          <p>Local message only. Sent status was not changed.</p>
        )}
        {job.status === 'unknown' && (
          <p>
            The outcome is uncertain. Do not send another email. Verify the
            matching provider record before reconciling.
          </p>
        )}
      </div>
      <div>
        {job.canRetry && (
          <button
            disabled={disabled}
            onClick={() =>
              perform(() => api.retryDispatch(job.id, job.revision))
            }
          >
            Retry original dispatch
          </button>
        )}
        {job.status === 'unknown' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(() =>
                api.reconcileDispatch(job.id, job.revision, providerId),
              );
            }}
          >
            <label>
              Provider email ID
              <input
                required
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              />
            </label>
            <button disabled={disabled}>Verify provider record</button>
          </form>
        )}
      </div>
    </article>
  );
}
