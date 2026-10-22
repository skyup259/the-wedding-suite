import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuestModel } from '@wedding-suite/shared/website';
import { ApiClientError } from '../../api/client.js';
import { updateSession, sessionKey } from '../auth/hooks.js';
import { WorkspaceFrame, QueryFailure } from './WorkspaceFrame.js';
import { statusLabel } from './calendar.js';
import * as api from './api.js';
import styles from './website.module.css';
import { demoMedia } from './demo-media.js';
export function GuestView({
  model,
  invitation,
}: {
  model: GuestModel;
  invitation?: { familyDisplayName: string; selectedEventIds: string[] };
}) {
  const { wedding: w, events, today } = model;
  const day = (instant: string) =>
    new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeZone: w.timezone,
    }).format(new Date(instant));
  const time = (instant: string) =>
    new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: w.timezone,
    }).format(new Date(instant));
  const current = events.filter((e) => today.active.includes(e.id)),
    next = events.find((e) => e.id === today.next);
  const mainDate = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(w.mainDate + 'T12:00:00Z'));
  const CoupleHeading = invitation ? 'h2' : 'h1';
  return (
    <div
      className={styles.guest}
      data-theme={w.website.themeId}
      style={{ '--guest-accent': w.website.accentColor } as CSSProperties}
    >
      <header className={styles.guestNav}>
        <a href="#welcome" aria-label="Wedding home">
          {w.couple.partner1Name} <span>&</span> {w.couple.partner2Name}
        </a>
        <nav aria-label="Wedding">
          <a href="#today">Latest</a>
          <a href="#schedule">Ceremonies</a>
        </nav>
      </header>
      <main>
        {invitation && (
          <section className={styles.welcome} aria-label="Personal invitation">
            <p className={styles.eyebrow}>A personal invitation</p>
            <h1>Dear {invitation.familyDisplayName},</h1>
            <p>You and your family are invited to attend these events.</p>
            {invitation.selectedEventIds.length ? (
              <>
                <p>Your invitation highlights:</p>
                <ul className={styles.invitedList}>
                  {events
                    .filter((e) => invitation.selectedEventIds.includes(e.id))
                    .map((e) => (
                      <li key={e.id}>
                        <a href={`#ceremony-${e.id}`}>{e.name}</a> ·{' '}
                        {day(e.startAt)}, {time(e.startAt)} ({w.timezone})
                        <p>
                          <strong>
                            {e.venue.name || 'Venue to be announced'}
                          </strong>
                          <br />
                          {e.venue.address}
                        </p>
                        <div className={styles.contacts}>
                          {e.contacts.map((contact, index) => (
                            <a
                              key={index}
                              href={`tel:${contact.phone.replace(/[^+0-9]/g, '')}`}
                            >
                              Call {contact.name}
                            </a>
                          ))}
                        </div>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p>
                The ceremony selection has changed. Please see the full schedule
                below.
              </p>
            )}
            <p>The full wedding schedule is open to every guest.</p>
          </section>
        )}
        <section id="welcome" className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.ornament} aria-hidden="true">
              ✳
            </div>
            <p className={styles.eyebrow}>Together with our families</p>
            <CoupleHeading>
              <span>{w.couple.partner1Name}</span>
              <em>&</em>
              <span>{w.couple.partner2Name}</span>
            </CoupleHeading>
            <p className={styles.date}>{mainDate}</p>
            {w.website.intro && (
              <p className={styles.intro}>{w.website.intro}</p>
            )}
            <a className={styles.guestButton} href="#schedule">
              Explore the celebrations <span aria-hidden="true">↓</span>
            </a>
          </div>
          <figure className={styles.heroPhoto}>
            <img
              src={demoMedia.covers[w.website.themeId]}
              alt="Sample wedding portrait from the design collection"
              width="512"
              height="512"
              fetchPriority="high"
            />
            <figcaption>
              Sample photography · Your photos will make this yours.
            </figcaption>
          </figure>
        </section>
        {w.website.welcomeMessage && (
          <section className={styles.welcome}>
            <span className={styles.eyebrow}>A note from us</span>
            <h2>We can’t wait to celebrate with you.</h2>
            <p>{w.website.welcomeMessage}</p>
          </section>
        )}
        <section id="today" className={styles.latest}>
          <div>
            <p className={styles.eyebrow}>From the organising team</p>
            <h2>The latest from our celebration</h2>
          </div>
          {w.latestAnnouncement && (
            <aside className={styles.announcement}>
              <h3>Latest announcement</h3>
              <p>{w.latestAnnouncement.message}</p>
              <small>
                Updated {day(w.latestAnnouncement.updatedAt)},{' '}
                {time(w.latestAnnouncement.updatedAt)}
              </small>
            </aside>
          )}
          {current.length ? (
            <div className={styles.current}>
              <p className={styles.eyebrow}>In progress</p>
              {current.map((e) => (
                <div key={e.id}>
                  <h3>{e.name}</h3>
                  <p>
                    {e.venue.name} · Scheduled {time(e.startAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : next ? (
            <div className={styles.current}>
              <p className={styles.eyebrow}>Next celebration</p>
              <h3>{next.name}</h3>
              <p>
                {day(next.startAt)} · {time(next.startAt)}
              </p>
              <p>{next.venue.name}</p>
            </div>
          ) : (
            <p>
              {events.length && events.every((e) => e.status === 'completed')
                ? 'All listed ceremonies are completed. Thank you for celebrating with us.'
                : today.overdue.length
                  ? 'The team will post the next update here. Scheduled ceremonies below remain Not started until the team updates them.'
                  : 'Our celebration details will appear here.'}
            </p>
          )}
        </section>
        <section id="schedule" className={styles.schedule}>
          <p className={styles.eyebrow}>Every moment, together</p>
          <h2>
            {invitation ? 'Full wedding schedule' : 'The wedding celebrations'}
          </h2>
          <p className={styles.muted}>
            All times in {w.timezone}. The full schedule is open to every guest.
          </p>
          {!events.length ? (
            <p>Ceremonies will be added soon.</p>
          ) : (
            events.map((e, i) => (
              <article
                className={styles.ceremony}
                key={e.id}
                id={`ceremony-${e.id}`}
              >
                <div className={styles.ceremonyDate}>
                  <img
                    className={styles.ceremonyPhoto}
                    src={demoMedia.ceremonies[i % demoMedia.ceremonies.length]}
                    alt=""
                    width="512"
                    height="300"
                    loading="lazy"
                  />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <p>{day(e.startAt)}</p>
                  <strong>
                    {time(e.startAt)}
                    {e.endAt && <> – {time(e.endAt)}</>}
                  </strong>
                </div>
                <div className={styles.ceremonyBody}>
                  <span className={styles.status} data-status={e.status}>
                    {statusLabel(e.status)}
                  </span>
                  {invitation?.selectedEventIds.includes(e.id) && (
                    <p className={styles.eyebrow}>You're invited</p>
                  )}
                  <h3>{e.name}</h3>
                  {e.description && <p>{e.description}</p>}
                  <p>
                    <strong>{e.venue.name || 'Venue to be announced'}</strong>
                    <br />
                    {e.venue.address}
                  </p>
                  {(e.venue.mapUrl || e.venue.address) && (
                    <a
                      className={styles.mapLink}
                      href={
                        e.venue.mapUrl ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue.address)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View directions <span aria-hidden="true">↗</span>
                    </a>
                  )}
                  {e.dressCode && (
                    <p>
                      <strong>Dress code:</strong> {e.dressCode}
                    </p>
                  )}
                  {e.instructions && <p>{e.instructions}</p>}
                  {e.contacts.length > 0 && (
                    <div className={styles.contacts}>
                      <span>Need a hand?</span>
                      {e.contacts.map((c, index) => (
                        <a
                          key={index}
                          href={`tel:${c.phone.replace(/[^+0-9]/g, '')}`}
                        >
                          Call {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                  <small className={styles.muted}>
                    Schedule updated {day(e.updatedAt)}, {time(e.updatedAt)}
                  </small>
                </div>
              </article>
            ))
          )}
        </section>
        <section
          className={styles.inspiration}
          aria-labelledby="inspiration-heading"
        >
          <p className={styles.eyebrow}>Little details, lasting memories</p>
          <h2 id="inspiration-heading">Celebration inspiration</h2>
          <p>
            Sample photographs from our design collection, ready to be replaced
            with your own memories.
          </p>
          <div className={styles.inspirationGrid}>
            {demoMedia.inspiration.map((photo) => (
              <img
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                width="512"
                height="286"
                loading="lazy"
              />
            ))}
          </div>
        </section>
      </main>
      <footer className={styles.guestFooter}>
        <span aria-hidden="true">✳</span>
        <p>
          With love, {w.couple.partner1Name} & {w.couple.partner2Name}
        </p>
        <small>The Wedding Suite</small>
      </footer>
    </div>
  );
}
export function GuestPage() {
  const { slug = '' } = useParams(),
    query = useQuery({
      queryKey: ['public-wedding', slug],
      queryFn: ({ signal }) => api.guest(slug, signal),
      retry: false,
      refetchInterval: 25000,
      refetchOnWindowFocus: 'always',
    });
  const { refetch } = query;
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refetch]);
  useEffect(() => {
    if (!query.data) return;
    const previous = document.title;
    document.title = `${query.data.wedding.couple.partner1Name} & ${query.data.wedding.couple.partner2Name} · Wedding celebrations`;
    return () => {
      document.title = previous;
    };
  }, [query.data]);
  if (query.isPending)
    return (
      <main className={styles.empty} role="status">
        Opening the celebration…
      </main>
    );
  if (
    !query.data ||
    (query.error instanceof ApiClientError && query.error.status === 404)
  )
    return (
      <main className={styles.empty}>
        <h1>
          {query.error instanceof ApiClientError && query.error.status === 404
            ? 'Wedding website not available'
            : 'Unable to load the wedding website'}
        </h1>
        <p>
          {query.error instanceof ApiClientError && query.error.status === 404
            ? 'This website may be unpublished, or the address may have changed.'
            : 'We could not reach the celebration. Please try again shortly.'}
        </p>
        <button
          onClick={() => {
            void query.refetch();
          }}
        >
          Try again
        </button>
      </main>
    );
  return (
    <>
      {query.isError ? (
        <div className={styles.refreshError} role="alert">
          Unable to refresh. Showing the last saved schedule.{' '}
          <button
            onClick={() => {
              void query.refetch();
            }}
          >
            Refresh now
          </button>
        </div>
      ) : (
        <p className={styles.refreshNote}>
          Last checked{' '}
          {new Intl.DateTimeFormat('en-IN', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            timeZone: query.data.wedding.timezone,
          }).format(new Date(query.dataUpdatedAt))}{' '}
          · Updates refresh automatically
        </p>
      )}
      <GuestView model={query.data} />
    </>
  );
}
export function PreviewPage() {
  const client = useQueryClient(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [published, setPublished] = useState(false);
  const query = useQuery({
    queryKey: ['website', 'preview'],
    queryFn: ({ signal }) => api.preview(signal),
    retry: false,
  });
  async function publish() {
    if (!query.data) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.publication(
        true,
        query.data.meta.weddingRevision,
      );
      // Settings can remount from cache before its background refresh completes.
      // Seed the acknowledged revision without resetting any mounted editor.
      await client.cancelQueries({ queryKey: ['website', 'settings'] });
      client.setQueryData(['website', 'settings'], result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['website'] }),
        client.invalidateQueries({ queryKey: sessionKey }),
      ]);
      setPublished(true);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401)
        await updateSession(client, null);
      setError(e instanceof Error ? e.message : 'Unable to publish.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceFrame title="Preview your celebration" error={query.error}>
        <p>
          This preview is private to your wedding team. Publish only when the
          schedule and contacts are ready for guests.
        </p>
        <div className={styles.toolbar}>
          <Link to="/website">Back to website settings</Link>
          <Link to="/events">Edit ceremonies</Link>
          {query.data && (
            <button
              disabled={busy}
              onClick={() => {
                void publish();
              }}
            >
              {busy ? 'Publishing…' : 'Publish website'}
            </button>
          )}
        </div>
        {error && (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <button
              onClick={() => {
                void query.refetch();
              }}
            >
              Reload preview
            </button>
          </div>
        )}
        {published && query.data && (
          <p role="status">
            Website published.{' '}
            <Link to={`/w/${query.data.data.wedding.slug}`}>
              Open guest website
            </Link>
          </p>
        )}
        {query.isError && (
          <QueryFailure
            retry={() => {
              void query.refetch();
            }}
          />
        )}
        {query.isPending && <p role="status">Loading preview…</p>}
      </WorkspaceFrame>
      {query.data && (
        <div className={styles.preview}>
          <GuestView model={query.data.data} />
        </div>
      )}
    </>
  );
}
