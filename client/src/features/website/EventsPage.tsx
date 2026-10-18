import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { localInstant, localTime, statusLabel } from './calendar.js';
import { eventInputSchema } from '@wedding-suite/shared/website';
import type { EventInput, WeddingEvent } from '@wedding-suite/shared/website';
import { ApiClientError } from '../../api/client.js';
import { updateSession } from '../auth/hooks.js';
import { Field } from '../auth/Field.js';
import { WorkspaceFrame, QueryFailure } from './WorkspaceFrame.js';
import * as api from './api.js';
import styles from './website.module.css';
export function EventsPage() {
  const client = useQueryClient(),
    [selected, setSelected] = useState<WeddingEvent | null | undefined>(
      undefined,
    ),
    [error, setError] = useState(''),
    [archive, setArchive] = useState<{
      event: WeddingEvent;
      referenced: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const wedding = useQuery({
      queryKey: ['website', 'settings'],
      queryFn: ({ signal }) => api.wedding(signal),
      retry: false,
    }),
    events = useQuery({
      queryKey: ['website', 'events'],
      queryFn: ({ signal }) => api.events(signal),
      retry: false,
    });
  async function doArchive(confirmed: boolean) {
    if (!archive) return;
    setBusy(true);
    setError('');
    try {
      await api.archiveEvent(
        archive.event.id,
        archive.event.revision,
        confirmed,
      );
      setArchive(null);
      await client.invalidateQueries({ queryKey: ['website'] });
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      if (e instanceof ApiClientError && e.code === 'RESOURCE_REFERENCED') {
        setArchive({ ...archive, referenced: true });
        setError(e.message);
      } else setError(e instanceof Error ? e.message : 'Unable to archive.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceFrame
      title="Ceremonies & celebrations"
      error={events.error ?? wedding.error}
    >
      <p className={styles.muted}>
        Times use your wedding timezone. Status changes are always manual.
      </p>
      {events.isPending || wedding.isPending ? (
        <p role="status">Loading ceremonies…</p>
      ) : events.isError || wedding.isError ? (
        <QueryFailure
          retry={() => {
            void events.refetch();
            void wedding.refetch();
          }}
        />
      ) : (
        <>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {archive && (
            <section
              className={styles.panel}
              aria-label="Archive ceremony confirmation"
            >
              <h2>Archive {archive.event.name}?</h2>
              <p>
                {archive.referenced
                  ? 'Linked invitation highlights will change. Historical references are retained.'
                  : 'This removes it from the active guest schedule. Historical records are kept.'}
              </p>
              <div className={styles.toolbar}>
                <button
                  disabled={busy}
                  onClick={() => {
                    void doArchive(archive.referenced);
                  }}
                >
                  {archive.referenced
                    ? 'Confirm referenced archive'
                    : 'Archive ceremony'}
                </button>
                <button
                  disabled={busy}
                  className={styles.secondary}
                  onClick={() => {
                    setArchive(null);
                    setError('');
                  }}
                >
                  Cancel archive
                </button>
              </div>
            </section>
          )}
          {selected !== undefined ? (
            <EventEditor
              key={selected?.id ?? 'new'}
              event={selected}
              zone={wedding.data.timezone}
              onCancel={() => setSelected(undefined)}
              onSaved={async () => {
                setSelected(undefined);
                await client.invalidateQueries({ queryKey: ['website'] });
              }}
            />
          ) : (
            <button onClick={() => setSelected(null)}>Add ceremony</button>
          )}
          {!events.data.length ? (
            <section className={styles.panel}>
              <h2>Your first celebration starts here.</h2>
              <p>
                Add the time, venue and people guests can call. You can save an
                incomplete draft, then complete the venue and contacts before
                publishing.
              </p>
            </section>
          ) : (
            <div className={styles.eventList}>
              {events.data.map((e) => (
                <article key={e.id} className={styles.panel}>
                  <div className={styles.toolbar}>
                    <span className={styles.eyebrow}>
                      {new Intl.DateTimeFormat('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: wedding.data.timezone,
                      }).format(new Date(e.startAt))}
                    </span>
                    <span className={styles.badge}>
                      {statusLabel(e.status)}
                    </span>
                  </div>
                  <h2>{e.name}</h2>
                  <p>{e.venue.name || 'Venue to be added'}</p>
                  <div className={styles.toolbar}>
                    <button
                      className={styles.secondary}
                      onClick={() => {
                        setSelected(e);
                        setError('');
                      }}
                    >
                      Edit {e.name}
                    </button>
                    <button
                      className={styles.secondary}
                      onClick={() => {
                        setArchive({ event: e, referenced: false });
                        setError('');
                      }}
                    >
                      Archive {e.name}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </WorkspaceFrame>
  );
}
type Values = {
  name: string;
  description: string;
  startLocal: string;
  endLocal: string;
  venueName: string;
  address: string;
  mapUrl: string;
  contact1Name: string;
  contact1Phone: string;
  contact2Name: string;
  contact2Phone: string;
  dressCode: string;
  instructions: string;
  status: EventInput['status'];
  sortOrder: number;
};
function EventEditor({
  event,
  zone,
  onCancel,
  onSaved,
}: {
  event: WeddingEvent | null;
  zone: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const form = useForm<Values>({
    defaultValues: {
      name: event?.name ?? '',
      description: event?.description ?? '',
      startLocal: localTime(event?.startAt, zone),
      endLocal: localTime(event?.endAt ?? undefined, zone),
      venueName: event?.venue.name ?? '',
      address: event?.venue.address ?? '',
      mapUrl: event?.venue.mapUrl ?? '',
      contact1Name: event?.contacts[0]?.name ?? '',
      contact1Phone: event?.contacts[0]?.phone ?? '',
      contact2Name: event?.contacts[1]?.name ?? '',
      contact2Phone: event?.contacts[1]?.phone ?? '',
      dressCode: event?.dressCode ?? '',
      instructions: event?.instructions ?? '',
      status: event?.status ?? 'not_started',
      sortOrder: event?.sortOrder ?? 0,
    },
  });
  const submit = form.handleSubmit(async (v) => {
    setError('');
    try {
      const contacts = [
        { name: v.contact1Name, phone: v.contact1Phone },
        { name: v.contact2Name, phone: v.contact2Phone },
      ].filter((c) => c.name.trim() || c.phone.trim());
      const parsed = eventInputSchema.safeParse({
        name: v.name,
        description: v.description,
        startAt: localInstant(v.startLocal, zone),
        endAt: v.endLocal ? localInstant(v.endLocal, zone) : null,
        venue: { name: v.venueName, address: v.address, mapUrl: v.mapUrl },
        contacts,
        dressCode: v.dressCode,
        instructions: v.instructions,
        status: v.status,
        sortOrder: v.sortOrder,
        stream: null,
      });
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(' '));
        return;
      }
      await api.saveEvent(parsed.data, event?.id, event?.revision);
      await onSaved();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(e instanceof Error ? e.message : 'Unable to save ceremony.');
    }
  });
  return (
    <section className={styles.panel}>
      <h2>{event ? 'Edit ceremony' : 'New ceremony'}</h2>
      <p>Times below are in {zone}.</p>
      <form onSubmit={submit} noValidate>
        <Field
          label="Ceremony name"
          {...form.register('name', { required: 'Enter a ceremony name.' })}
          error={form.formState.errors.name?.message}
        />
        <div className={styles.pair}>
          <Field
            label="Start date and time"
            type="datetime-local"
            {...form.register('startLocal', {
              required: 'Choose a start time.',
            })}
            error={form.formState.errors.startLocal?.message}
          />
          <Field
            label="End date and time (optional)"
            type="datetime-local"
            {...form.register('endLocal')}
          />
        </div>
        <label className={styles.label} htmlFor="description">
          Description
        </label>
        <textarea id="description" rows={3} {...form.register('description')} />
        <div className={styles.pair}>
          <Field label="Venue name" {...form.register('venueName')} />
          <Field label="Venue address" {...form.register('address')} />
        </div>
        <Field
          label="Map link (HTTPS, optional)"
          type="url"
          {...form.register('mapUrl')}
        />
        <fieldset>
          <legend>Guest contacts · one or two required to publish</legend>
          <div className={styles.pair}>
            <Field
              label="First contact name"
              {...form.register('contact1Name')}
            />
            <Field
              label="First contact phone"
              type="tel"
              {...form.register('contact1Phone')}
            />
            <Field
              label="Second contact name (optional)"
              {...form.register('contact2Name')}
            />
            <Field
              label="Second contact phone (optional)"
              type="tel"
              {...form.register('contact2Phone')}
            />
          </div>
        </fieldset>
        <Field label="Dress code" {...form.register('dressCode')} />
        <label className={styles.label} htmlFor="instructions">
          Guest instructions
        </label>
        <textarea
          id="instructions"
          rows={3}
          {...form.register('instructions')}
        />
        <div className={styles.pair}>
          <div>
            <label className={styles.label} htmlFor="event-status">
              Ceremony status
            </label>
            <select id="event-status" {...form.register('status')}>
              {(['not_started', 'in_progress', 'completed'] as const).map(
                (s) => (
                  <option value={s} key={s}>
                    {statusLabel(s)}
                  </option>
                ),
              )}
            </select>
          </div>
          <Field
            label="Order for ceremonies at the same time"
            type="number"
            min={0}
            max={100000}
            {...form.register('sortOrder', { valueAsNumber: true })}
          />
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error} Your entries are retained; cancel and reopen to load the
            latest saved version after a conflict.
          </p>
        )}
        <div className={styles.toolbar}>
          <button disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save ceremony'}
          </button>
          <button
            type="button"
            disabled={form.formState.isSubmitting}
            className={styles.secondary}
            onClick={onCancel}
          >
            Cancel editing
          </button>
        </div>
      </form>
    </section>
  );
}
