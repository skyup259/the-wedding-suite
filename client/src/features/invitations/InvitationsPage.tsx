import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { invitationInputSchema } from '@wedding-suite/shared/invitations';
import type {
  Invitation,
  InvitationInput,
  InvitationShare,
} from '@wedding-suite/shared/invitations';
import type { WeddingEvent } from '@wedding-suite/shared/website';
import { WorkspaceFrame, QueryFailure } from '../website/WorkspaceFrame.js';
import { demoMedia } from '../website/demo-media.js';
import {
  events as loadEvents,
  wedding as loadWedding,
} from '../website/api.js';
import { ApiClientError } from '../../api/client.js';
import { updateSession } from '../auth/hooks.js';
import * as api from './api.js';
import styles from './invitations.module.css';
export function InvitationsPage() {
  const client = useQueryClient();
  const [filters, setFilters] = useState<api.Filters>({
    search: '',
    sentStatus: '',
    eventId: '',
  });
  const [editor, setEditor] = useState<Invitation | 'new' | null>(null),
    [share, setShare] = useState<InvitationShare | null>(null),
    [confirmation, setConfirmation] = useState<{
      item: Invitation;
      action: 'rotate-link' | 'archive';
    } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['invitations', 'list', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => api.list(filters, pageParam, signal),
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['invitations', 'estimates'],
    queryFn: ({ signal }) => api.estimates(signal),
    retry: false,
  });
  const events = useQuery({
    queryKey: ['website', 'events'],
    queryFn: ({ signal }) => loadEvents(signal),
    retry: false,
  });
  const wedding = useQuery({
    queryKey: ['website', 'settings'],
    queryFn: ({ signal }) => loadWedding(signal),
    retry: false,
  });
  const failure = list.error ?? summary.error ?? events.error ?? wedding.error;
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['invitations'] });
  }
  async function report(e: unknown) {
    if (e instanceof ApiClientError && e.status === 401)
      await updateSession(client, null);
    setError(
      e instanceof Error ? e.message : 'Unable to complete this action.',
    );
  }
  async function action(
    item: Invitation,
    kind: 'share' | 'sent-status' | 'rotate-link' | 'archive',
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    setShare(null);
    try {
      if (kind === 'share') setShare(await api.share(item.id));
      else {
        await api.change(
          item.id,
          item.revision,
          kind,
          kind === 'sent-status'
            ? item.sentStatus === 'sent'
              ? 'not_sent'
              : 'sent'
            : undefined,
        );
        await refresh();
        setConfirmation(null);
        setNotice(
          kind === 'archive'
            ? 'Family archived. Its invitation link is no longer valid.'
            : kind === 'rotate-link'
              ? 'Invitation link replaced. Previous copies no longer work.'
              : 'Sent status updated.',
        );
      }
    } catch (e) {
      await report(e);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, message: string) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setError('Copy unavailable. Select and copy the link or message above.');
    }
  }
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <WorkspaceFrame title="Families & invitations" error={failure}>
      <figure className={styles.stationery}>
        <img
          src={demoMedia.stationery}
          alt="Sample ivory wedding stationery with gold botanical details"
          width="512"
          height="286"
        />
        <figcaption>Sample invitation inspiration</figcaption>
      </figure>
      <p>
        <Link to="/invitations/email">Prepare family email batch</Link>
      </p>
      <p>
        Invite each family to your celebrations. Share their personal link, then
        mark Sent when you have sent it.
      </p>
      {wedding.data?.publicationStatus === 'draft' && (
        <p className={styles.callout}>
          You can prepare families now.{' '}
          <Link to="/website/preview">Preview and publish your website</Link>{' '}
          before sharing; personal guest links stay unavailable while
          unpublished.
        </p>
      )}
      {summary.data && (
        <section className={styles.summary} aria-label="Attendance estimates">
          <div>
            <strong>{summary.data.totalFamilies}</strong>
            <span>Families</span>
          </div>
          <div>
            <strong>{summary.data.sentFamilies}</strong>
            <span>Marked Sent</span>
          </div>
          <div>
            <strong>
              {summary.data.attendees.min}–{summary.data.attendees.max}
            </strong>
            <span>Estimated attendees</span>
          </div>
          <p>
            Estimate only: 2–3 people per unique Sent family. Re-sharing does
            not increase the count.
          </p>
          <details>
            <summary>Estimates by ceremony</summary>
            {summary.data.events.map((e) => (
              <p key={e.eventId}>
                {e.name}: {e.sentFamilies} Sent families · {e.min}–{e.max}{' '}
                estimated attendees
              </p>
            ))}
          </details>
        </section>
      )}
      <div className={styles.toolbar}>
        <button
          onClick={() => {
            setEditor('new');
            setShare(null);
            setError('');
          }}
          disabled={busy || !events.data?.length}
        >
          Add family
        </button>
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() => {
            void refresh();
            void events.refetch();
            void wedding.refetch();
          }}
        >
          Refresh list
        </button>
      </div>
      {events.data?.length === 0 && (
        <p>
          <Link to="/events">Add a ceremony</Link> before creating your first
          invitation.
        </p>
      )}
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setFilters({
            search: String(data.get('search') ?? '').trim(),
            sentStatus: String(data.get('sentStatus') ?? ''),
            eventId: String(data.get('eventId') ?? ''),
          });
          setShare(null);
        }}
      >
        <label>
          Search families or contacts
          <input name="search" maxLength={100} type="search" />
        </label>
        <label>
          Sent status
          <select name="sentStatus">
            <option value="">All families</option>
            <option value="not_sent">Not sent</option>
            <option value="sent">Sent</option>
          </select>
        </label>
        <label>
          Ceremony
          <select name="eventId">
            <option value="">All ceremonies</option>
            {events.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error} If the family changed, refresh the list before trying again.
        </p>
      )}
      {notice && (
        <p role="status" className={styles.callout}>
          {notice}
        </p>
      )}
      {editor && events.data && (
        <FamilyEditor
          key={editor === 'new' ? 'new' : `${editor.id}:${editor.revision}`}
          item={editor === 'new' ? null : editor}
          events={events.data}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null);
            setNotice('Family saved.');
            void refresh();
          }}
          reload={async (id) => {
            try {
              setEditor(await api.detail(id));
            } catch (e) {
              await report(e);
            }
          }}
        />
      )}
      {confirmation && (
        <section
          className={styles.panel}
          aria-label="Confirm invitation change"
        >
          <h2>
            {confirmation.action === 'archive'
              ? 'Archive family?'
              : 'Replace invitation link?'}
          </h2>
          <p>
            {confirmation.item.familyDisplayName}:{' '}
            {confirmation.action === 'archive'
              ? 'The family will leave active lists and estimates. Their existing invitation link will stop working.'
              : 'Every previous copy of this family’s invitation link will stop working. Sent status will stay unchanged.'}
          </p>
          <div className={styles.toolbar}>
            <button
              disabled={busy}
              onClick={() => {
                void action(confirmation.item, confirmation.action);
              }}
            >
              Confirm{' '}
              {confirmation.action === 'archive' ? 'archive' : 'replacement'}
            </button>
            <button
              disabled={busy}
              className={styles.secondary}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {share && (
        <section className={styles.panel} aria-label="Share invitation">
          <h2>Your invitation is ready</h2>
          <p>
            This personal link contains the family greeting. Share it only with
            its intended recipients. Opening WhatsApp or copying does not mark
            Sent.
          </p>
          <label>
            Invitation link
            <input
              readOnly
              value={share.url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <label>
            Message
            <textarea readOnly rows={8} value={share.message} />
          </label>
          <div className={styles.toolbar}>
            <button
              onClick={() => {
                void copy(share.message, 'Invitation message copied.');
              }}
            >
              Copy message
            </button>
            <button
              className={styles.secondary}
              onClick={() => {
                void copy(share.url, 'Invitation link copied.');
              }}
            >
              Copy link
            </button>
            <a
              href={share.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </a>
            <button className={styles.secondary} onClick={() => setShare(null)}>
              Close sharing
            </button>
          </div>
        </section>
      )}
      {failure && (
        <QueryFailure
          retry={() => {
            void refresh();
            void events.refetch();
            void wedding.refetch();
          }}
        />
      )}
      {list.isPending && <p role="status">Loading families…</p>}
      {!list.isPending && !list.isError && items.length === 0 && (
        <p className={styles.empty}>
          {filters.search || filters.eventId || filters.sentStatus
            ? 'No families match these filters.'
            : 'No families added yet. Start with your first invitation.'}
        </p>
      )}
      <div className={styles.list}>
        {items.map((i) => (
          <article key={i.id} className={styles.card}>
            <div>
              <p className={styles.badge}>
                {i.sentStatus === 'sent' ? 'Sent' : 'Not sent'}
              </p>
              <h2>{i.familyDisplayName}</h2>
              <p>
                Contact: {i.contactName}
                {i.phone ? ` · ${i.phone}` : ''}
              </p>
              <p>
                {i.eventIds
                  .map(
                    (id) =>
                      events.data?.find((e) => e.id === id)?.name ??
                      'Archived ceremony',
                  )
                  .join(' · ')}
              </p>
              {i.archivedEventIds.length > 0 && (
                <p className={styles.warning}>
                  Invitation content changed: an included ceremony was archived.
                  Edit the selection before re-sharing.
                </p>
              )}
              {i.sentAt && (
                <small>Marked Sent {new Date(i.sentAt).toLocaleString()}</small>
              )}
            </div>
            <div className={styles.actions}>
              <button
                disabled={busy}
                onClick={() => {
                  void action(i, 'share');
                }}
              >
                Share invitation
              </button>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() => {
                  setEditor(i);
                  setShare(null);
                }}
              >
                Edit family
              </button>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() => {
                  void action(i, 'sent-status');
                }}
              >
                {i.sentStatus === 'sent' ? 'Mark Not sent' : 'Mark Sent'}
              </button>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() => {
                  setConfirmation({ item: i, action: 'rotate-link' });
                  setShare(null);
                }}
              >
                Replace link
              </button>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() => {
                  setConfirmation({ item: i, action: 'archive' });
                  setShare(null);
                }}
              >
                Archive family
              </button>
            </div>
          </article>
        ))}
      </div>
      {list.hasNextPage && (
        <button
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {list.isFetchingNextPage ? 'Loading…' : 'Load more families'}
        </button>
      )}
    </WorkspaceFrame>
  );
}
function FamilyEditor({
  item,
  events,
  close,
  saved,
  reload,
}: {
  item: Invitation | null;
  events: WeddingEvent[];
  close: () => void;
  saved: () => void;
  reload: (id: string) => Promise<void>;
}) {
  const client = useQueryClient();
  const [value, setValue] = useState<InvitationInput>(() =>
    item
      ? {
          familyDisplayName: item.familyDisplayName,
          contactName: item.contactName,
          phone: item.phone,
          ...(item.email !== undefined ? { email: item.email } : {}),
          eventIds: [...item.eventIds],
        }
      : { familyDisplayName: '', contactName: '', phone: '', eventIds: [] },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = invitationInputSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.save(parsed.data, item?.id, item?.revision);
      saved();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to save. Your entries are retained.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <h2>{item ? 'Edit family' : 'Add a family'}</h2>
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <div className={styles.fields}>
          <label>
            Family display name
            <input
              required
              maxLength={120}
              autoFocus
              value={value.familyDisplayName}
              onChange={(e) =>
                setValue({ ...value, familyDisplayName: e.target.value })
              }
            />
          </label>
          <label>
            Contact name
            <input
              required
              maxLength={120}
              value={value.contactName}
              onChange={(e) =>
                setValue({ ...value, contactName: e.target.value })
              }
            />
          </label>
          <label>
            Contact phone (optional)
            <input
              type="tel"
              maxLength={25}
              value={value.phone}
              onChange={(e) => setValue({ ...value, phone: e.target.value })}
            />
          </label>
          <label>
            Contact email (optional)
            <input
              type="email"
              maxLength={254}
              value={value.email ?? ''}
              onChange={(e) => setValue({ ...value, email: e.target.value })}
            />
          </label>
        </div>
        <fieldset>
          <legend>Highlight these ceremonies in the invitation</legend>
          <p>
            Choose at least one. Every guest can still see the full wedding
            schedule.
          </p>
          {events.map((e) => (
            <label key={e.id} className={styles.check}>
              <input
                type="checkbox"
                checked={value.eventIds.includes(e.id)}
                onChange={(ev) =>
                  setValue({
                    ...value,
                    eventIds: ev.target.checked
                      ? [...value.eventIds, e.id]
                      : value.eventIds.filter((id) => id !== e.id),
                  })
                }
              />
              {e.name}
            </label>
          ))}
          {value.eventIds
            .filter((id) => !events.some((e) => e.id === id))
            .map((id) => (
              <label key={id} className={styles.check}>
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    setValue({
                      ...value,
                      eventIds: value.eventIds.filter((v) => v !== id),
                    })
                  }
                />
                Archived ceremony — remove this selection
              </label>
            ))}
        </fieldset>
        {error && (
          <p role="alert" className={styles.error}>
            {error} Your entries are retained.
          </p>
        )}
        <div className={styles.toolbar}>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save family'}</button>
          <button
            type="button"
            disabled={busy}
            className={styles.secondary}
            onClick={close}
          >
            Cancel
          </button>
          {item && (
            <button
              type="button"
              disabled={busy}
              className={styles.secondary}
              onClick={() => {
                void reload(item.id);
              }}
            >
              Reload saved family (discard edits)
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
