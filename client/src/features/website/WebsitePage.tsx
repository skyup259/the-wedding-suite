import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  weddingEditSchema,
  themes,
  accentColors,
} from '@wedding-suite/shared/website';
import type { WeddingEdit, Wedding } from '@wedding-suite/shared/website';
import { Field } from '../auth/Field.js';
import { ApiClientError } from '../../api/client.js';
import { updateSession, sessionKey } from '../auth/hooks.js';
import { WorkspaceFrame, QueryFailure } from './WorkspaceFrame.js';
import { demoMedia } from './demo-media.js';
import * as api from './api.js';
import styles from './website.module.css';
export function WebsitePage() {
  const query = useQuery({
    queryKey: ['website', 'settings'],
    queryFn: ({ signal }) => api.wedding(signal),
    retry: false,
  });
  return (
    <WorkspaceFrame title="Your wedding website" error={query.error}>
      {query.isPending ? (
        <p role="status">Loading website settings…</p>
      ) : query.isError ? (
        <QueryFailure
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <WebsiteEditor initial={query.data} />
      )}
    </WorkspaceFrame>
  );
}
const editable = (w: Wedding): WeddingEdit => ({
  couple: w.couple,
  mainDate: w.mainDate,
  timezone: w.timezone,
  website: w.website,
  location: w.location,
});
function WebsiteEditor({ initial }: { initial: Wedding }) {
  const client = useQueryClient(),
    [current, setCurrent] = useState(initial),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(initial.latestAnnouncement?.message ?? '');
  const form = useForm<WeddingEdit>({
    resolver: zodResolver(weddingEditSchema),
    defaultValues: editable(initial),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['website'] }),
      client.invalidateQueries({ queryKey: sessionKey }),
    ]);
  }
  async function action(work: () => Promise<Wedding>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await work();
      setCurrent(result);
      await refresh();
      setMessage(success);
      return result;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(
        e instanceof Error ? e.message : 'Unable to save. Please try again.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  const submit = form.handleSubmit(async (input) => {
    const result = await action(
      () => api.saveWedding(input, current.revision),
      current.publicationStatus === 'published'
        ? 'Website saved. Your changes are now live.'
        : 'Draft saved. Preview it before publishing.',
    );
    if (result) form.reset(editable(result));
  });
  async function reload() {
    setBusy(true);
    try {
      const result = await api.wedding(new AbortController().signal);
      setCurrent(result);
      form.reset(editable(result));
      setNotice(result.latestAnnouncement?.message ?? '');
      setError('');
      setMessage('Loaded the saved version.');
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(e instanceof Error ? e.message : 'Unable to reload.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.badge}>
          {current.publicationStatus === 'published'
            ? 'Published'
            : 'Draft · private'}
        </span>
        <Link className={styles.buttonLink} to="/website/preview">
          Preview saved website
        </Link>
        {current.publicationStatus === 'published' && (
          <>
            <Link to={`/w/${current.slug}`}>Open guest website</Link>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => {
                void action(
                  () => api.publication(false, current.revision),
                  'Website unpublished. Anonymous access is closed.',
                );
              }}
            >
              Unpublish
            </button>
          </>
        )}
      </div>
      <p className={styles.muted}>
        Your address: /w/{current.slug}.{' '}
        {current.publicationStatus === 'published'
          ? 'Saved changes become live immediately.'
          : 'Only your wedding team can preview this draft.'}
      </p>
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            disabled={busy}
            onClick={() => {
              void reload();
            }}
          >
            Reload saved version and discard local edits
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <form onSubmit={submit} noValidate>
        <section className={styles.panel}>
          <h2>The two of you</h2>
          <div className={styles.pair}>
            <Field
              label="First partner’s name"
              {...form.register('couple.partner1Name')}
              error={form.formState.errors.couple?.partner1Name?.message}
            />
            <Field
              label="Second partner’s name"
              {...form.register('couple.partner2Name')}
              error={form.formState.errors.couple?.partner2Name?.message}
            />
            <Field
              label="Main wedding date"
              type="date"
              {...form.register('mainDate')}
              error={form.formState.errors.mainDate?.message}
            />
            <Field
              label="Wedding timezone"
              {...form.register('timezone')}
              error={form.formState.errors.timezone?.message}
            />
          </div>
          <p className={styles.muted}>
            The main date anchors the seven-day photo access window. Your
            published website address stays fixed after first publication.
          </p>
        </section>
        <section className={styles.panel}>
          <h2>Choose your atmosphere</h2>
          <fieldset className={styles.themes}>
            <legend>Website theme</legend>
            {themes.map((t) => (
              <label
                key={t.id}
                className={styles.themeOption}
                data-theme={t.id}
              >
                <input
                  type="radio"
                  value={t.id}
                  {...form.register('website.themeId')}
                />
                <span className={styles.themeSwatch} aria-hidden="true">
                  <img
                    src={demoMedia.covers[t.id]}
                    alt=""
                    width="512"
                    height="286"
                    loading="lazy"
                  />
                  <span>A & B</span>
                </span>
                <strong>{t.label}</strong>
                <span>{t.description}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.label} htmlFor="accent">
            Accent colour
          </label>
          <select id="accent" {...form.register('website.accentColor')}>
            {accentColors.map((c, i) => (
              <option key={c} value={c}>
                {['Olive', 'Terracotta', 'Plum', 'Midnight blue'][i]}
              </option>
            ))}
          </select>
          <p className={styles.muted}>
            Each theme keeps the same ceremonies and links. Sample photographs
            from the design collection are used until your own photos are ready.
          </p>
        </section>
        <section className={styles.panel}>
          <h2>A welcome for your guests</h2>
          <label className={styles.label} htmlFor="intro">
            Introduction
          </label>
          <textarea
            id="intro"
            rows={3}
            maxLength={1000}
            {...form.register('website.intro')}
          />
          <label className={styles.label} htmlFor="welcome">
            Welcome message
          </label>
          <textarea
            id="welcome"
            rows={5}
            maxLength={2000}
            {...form.register('website.welcomeMessage')}
          />
          <p className={styles.muted}>
            Plain text only. Guest content contains no team accounts or private
            family details.
          </p>
        </section>
        <button disabled={busy || form.formState.isSubmitting}>
          {busy ? 'Saving…' : 'Save website'}
        </button>
        {form.formState.isDirty && (
          <p className={styles.muted}>
            Unsaved changes are not included in the preview.
          </p>
        )}
      </form>
      <section className={styles.panel}>
        <h2>Latest announcement</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(
              async () => {
                await api.announcement(notice.trim() || null, current.revision);
                return api.wedding(new AbortController().signal);
              },
              notice.trim() ? 'Announcement saved.' : 'Announcement removed.',
            );
          }}
        >
          <label className={styles.label} htmlFor="announcement">
            Announcement for all guests
          </label>
          <textarea
            id="announcement"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            maxLength={1000}
            rows={3}
          />
          <button disabled={busy}>
            {notice.trim() ? 'Save announcement' : 'Clear announcement'}
          </button>
        </form>
      </section>
    </>
  );
}
