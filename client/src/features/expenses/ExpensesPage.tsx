import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  expenseInputSchema,
  paymentInputSchema,
  formatINR,
  rupeesToPaise,
  paiseToRupees,
} from '@wedding-suite/shared/expenses';
import type {
  Expense,
  ExpenseInput,
  PaymentInput,
} from '@wedding-suite/shared/expenses';
import { ZodError } from 'zod';
import { ApiClientError } from '../../api/client.js';
import { WorkspaceFrame } from '../website/WorkspaceFrame.js';
import { events } from '../website/api.js';
import { useSession } from '../auth/hooks.js';
import * as api from './api.js';
import styles from './expenses.module.css';
function message(e: unknown) {
  if (e instanceof ZodError)
    return e.issues.map((i) => `${i.path.join(' ')}: ${i.message}`).join(' ');
  if (e instanceof ApiClientError)
    return (
      e.fields?.map((f) => `${f.path}: ${f.message}`).join(' ') || e.message
    );
  return e instanceof Error ? e.message : 'Unable to save. Please try again.';
}
export function ExpensesPage() {
  const client = useQueryClient(),
    [filters, setFilters] = useState<api.Filters>({
      eventId: '',
      category: '',
      payerName: '',
    }),
    [draft, setDraft] = useState(filters),
    [editor, setEditor] = useState<Expense | null | undefined>(),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [paymentLocked, setPaymentLocked] = useState(false);
  const ceremonies = useQuery({
    queryKey: ['events'],
    queryFn: ({ signal }) => events(signal),
  });
  const expenses = useInfiniteQuery({
    queryKey: ['expenses', 'list', filters],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => api.list(filters, pageParam, signal),
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
  });
  const totals = useQuery({
    queryKey: ['expenses', 'summary', filters.eventId, filters.category],
    queryFn: ({ signal }) => api.summary(filters, signal),
  });
  const paid = useInfiniteQuery({
    queryKey: ['expenses', 'payments', filters],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      api.payments(filters, pageParam, signal),
    getNextPageParam: (p) => p.meta.nextCursor ?? undefined,
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['expenses'] });
  }
  async function open(id: string) {
    setLoading(true);
    setError(undefined);
    try {
      setEditor(await api.detail(id));
      setNotice('');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  const eventOptions = ceremonies.data ?? [];
  const problem =
    error ?? expenses.error ?? totals.error ?? paid.error ?? ceremonies.error;
  return (
    <WorkspaceFrame title="Expenses & payments" error={problem}>
      <p>
        Keep a shared record of wedding costs, who paid, and what is still
        payable. All amounts are in INR.
      </p>
      {problem !== undefined && problem !== null && (
        <div role="alert">
          <p>{message(problem)}</p>
          <button
            onClick={() => {
              setError(undefined);
              void refresh();
              void ceremonies.refetch();
            }}
          >
            Retry loading
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <section aria-label="Expense totals" className={styles.totals}>
        {totals.data ? (
          (
            [
              ['Recorded cost', totals.data.costPaise],
              ['Paid', totals.data.paidPaise],
              ['Outstanding', totals.data.outstandingPaise],
              ['Overpaid', totals.data.overpaidPaise],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{formatINR(value)}</strong>
            </div>
          ))
        ) : (
          <p role="status">
            {totals.isPending ? 'Loading totals…' : 'Totals unavailable'}
          </p>
        )}
      </section>
      <p className={styles.hint}>
        Totals include all expenses matching the ceremony and category. The
        payer filter applies to the expense list and payment report below.
      </p>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft });
        }}
      >
        <label>
          Ceremony filter
          <select
            value={draft.eventId}
            onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}
          >
            <option value="">All ceremonies & shared</option>
            <option value="shared">Shared across wedding</option>
            {eventOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.archivedAt ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category filter
          <input
            maxLength={80}
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="Exact category"
          />
        </label>
        <label>
          Payer filter
          <input
            maxLength={120}
            value={draft.payerName}
            onChange={(e) => setDraft({ ...draft, payerName: e.target.value })}
            placeholder="Exact payer name"
          />
        </label>
        <button>Apply filters</button>
        <button
          type="button"
          onClick={() => {
            const empty = { eventId: '', category: '', payerName: '' };
            setDraft(empty);
            setFilters(empty);
          }}
        >
          Clear filters
        </button>
      </form>
      <div className={styles.heading}>
        <h2>Expense records</h2>
        <button
          disabled={loading || paymentLocked}
          onClick={() => {
            setEditor(null);
            setNotice('');
          }}
        >
          Add expense
        </button>
      </div>
      {expenses.isPending && <p role="status">Loading expenses…</p>}
      {expenses.isSuccess &&
        expenses.data.pages.every((p) => p.data.length === 0) && (
          <p>
            No expenses match these filters. Add your first expense to start
            tracking payments.
          </p>
        )}
      <div className={styles.records}>
        {expenses.data?.pages
          .flatMap((p) => p.data)
          .map((e) => (
            <article key={e.id} className={styles.card}>
              <div className={styles.heading}>
                <h3>{e.description}</h3>
                <button
                  disabled={loading || paymentLocked}
                  onClick={() => void open(e.id)}
                >
                  Manage {e.description}
                </button>
              </div>
              <p>
                {e.category} ·{' '}
                {e.eventId
                  ? (eventOptions.find((c) => c.id === e.eventId)?.name ??
                    'Archived ceremony')
                  : 'Shared across wedding'}
                {e.vendorName ? ` · ${e.vendorName}` : ''}
              </p>
              <dl className={styles.amounts}>
                <div>
                  <dt>Cost</dt>
                  <dd>{formatINR(e.costPaise)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>{formatINR(e.paidPaise)}</dd>
                </div>
                <div>
                  <dt>Outstanding</dt>
                  <dd>{formatINR(e.outstandingPaise)}</dd>
                </div>
              </dl>
              {e.warnings.length > 0 && (
                <p className={styles.warning}>
                  Overpayment recorded: {formatINR(e.overpaidPaise)}. Review the
                  cost and payments for this expense.
                </p>
              )}
            </article>
          ))}
      </div>
      {expenses.hasNextPage && (
        <button
          disabled={expenses.isFetchingNextPage}
          onClick={() => void expenses.fetchNextPage()}
        >
          Load more expenses
        </button>
      )}
      {editor !== undefined && (
        <ExpenseEditor
          key={editor?.id ?? 'new'}
          initial={editor}
          paymentLocked={paymentLocked}
          onPaymentLock={setPaymentLocked}
          onAuthError={setError}
          events={eventOptions}
          onClose={() => setEditor(undefined)}
          onSaved={async (e, text) => {
            setEditor(e);
            setNotice(text);
            await refresh();
          }}
          onArchived={async () => {
            setEditor(undefined);
            setNotice('Expense archived. It is excluded from active totals.');
            await refresh();
          }}
        />
      )}
      <section aria-label="Payment report" className={styles.report}>
        <h2>Payment report</h2>
        <p>
          Individual payments matching the selected ceremony, category and
          payer. Expense records show the whole cost; this report shows only the
          matching payer’s payments.
        </p>
        {paid.data && (
          <p>
            <strong>
              Matching payments:{' '}
              {formatINR(paid.data.pages[0]!.meta.totalPaidPaise)}
            </strong>
          </p>
        )}
        {paid.isPending && <p role="status">Loading payments…</p>}
        {paid.isSuccess &&
          paid.data.pages.every((p) => p.data.length === 0) && (
            <p>No payments match these filters.</p>
          )}
        <ul>
          {paid.data?.pages
            .flatMap((p) => p.data)
            .map((p) => (
              <li key={p.id}>
                <strong>{formatINR(p.amountPaise)}</strong> · {p.paidByName} ·{' '}
                {p.paymentDate}
                <br />
                {p.description}
                {p.method ? ` · ${p.method}` : ''}
              </li>
            ))}
        </ul>
        {paid.hasNextPage && (
          <button
            disabled={paid.isFetchingNextPage}
            onClick={() => void paid.fetchNextPage()}
          >
            Load more payments
          </button>
        )}
      </section>
    </WorkspaceFrame>
  );
}
type EventOption = { id: string; name: string; archivedAt: string | null };
function ExpenseEditor({
  initial,
  paymentLocked,
  onPaymentLock,
  onAuthError,
  events,
  onClose,
  onSaved,
  onArchived,
}: {
  initial: Expense | null;
  paymentLocked: boolean;
  onPaymentLock: (locked: boolean) => void;
  onAuthError: (e: unknown) => void;
  events: EventOption[];
  onClose: () => void;
  onSaved: (e: Expense, text: string) => Promise<void>;
  onArchived: () => Promise<void>;
}) {
  const [saved, setSaved] = useState(initial),
    [input, setInput] = useState({
      description: initial?.description ?? '',
      category: initial?.category ?? '',
      eventId: initial?.eventId ?? '',
      vendorName: initial?.vendorName ?? '',
      notes: initial?.notes ?? '',
      amount: initial ? paiseToRupees(initial.costPaise) : '',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [confirm, setConfirm] = useState<string | null>(null),
    [paymentId, setPaymentId] = useState<string | null | undefined>();
  function change(key: keyof typeof input, value: string) {
    setInput({ ...input, [key]: value });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const data: ExpenseInput = expenseInputSchema.parse({
        description: input.description,
        category: input.category,
        eventId: input.eventId || null,
        vendorName: input.vendorName,
        notes: input.notes,
        costPaise: rupeesToPaise(input.amount),
      });
      const result = await api.save(data, saved ?? undefined);
      setSaved(result);
      await onSaved(result, initial ? 'Expense updated.' : 'Expense added.');
    } catch (e) {
      setError(e);
      if (e instanceof ApiClientError && e.status === 401) onAuthError(e);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!saved) return;
    setBusy(true);
    try {
      const e = await api.detail(saved.id);
      setSaved(e);
      setInput({
        description: e.description,
        category: e.category,
        eventId: e.eventId ?? '',
        vendorName: e.vendorName,
        notes: e.notes,
        amount: paiseToRupees(e.costPaise),
      });
      setPaymentId(undefined);
      setError(undefined);
      await onSaved(e, 'Latest expense loaded; local edits discarded.');
    } catch (e) {
      setError(e);
      if (e instanceof ApiClientError && e.status === 401) onAuthError(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!saved || !confirm) return;
    setBusy(true);
    setError(undefined);
    try {
      if (confirm === 'archive') {
        await api.archive(saved);
        await onArchived();
      } else {
        await api.removePayment(saved, confirm);
        const e = await api.detail(saved.id);
        setSaved(e);
        await onSaved(e, 'Payment removed.');
      }
      setConfirm(null);
    } catch (e) {
      setError(e);
      if (e instanceof ApiClientError && e.status === 401) onAuthError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Manage expense" className={styles.editor}>
      <div className={styles.heading}>
        <h2>{saved ? 'Manage expense' : 'New expense'}</h2>
        <button disabled={busy || paymentLocked} onClick={onClose}>
          Close expense
        </button>
      </div>
      {error !== undefined && <p role="alert">{message(error)}</p>}
      <form onSubmit={(e) => void save(e)}>
        <fieldset disabled={busy || paymentLocked}>
          <legend>Expense details</legend>
          <div className={styles.grid}>
            <label>
              Description
              <input
                required
                maxLength={200}
                value={input.description}
                onChange={(e) => change('description', e.target.value)}
              />
            </label>
            <label>
              Category
              <input
                required
                maxLength={80}
                value={input.category}
                onChange={(e) => change('category', e.target.value)}
                placeholder="e.g. Photography"
              />
            </label>
            <label>
              Total cost (INR)
              <input
                required
                inputMode="decimal"
                value={input.amount}
                onChange={(e) => change('amount', e.target.value)}
                placeholder="80000.00"
              />
            </label>
            <label>
              Related ceremony
              <select
                value={input.eventId}
                onChange={(e) => change('eventId', e.target.value)}
              >
                <option value="">Shared across wedding</option>
                {events
                  .filter((e) => !e.archivedAt || e.id === input.eventId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Vendor / recipient (optional)
              <input
                maxLength={160}
                value={input.vendorName}
                onChange={(e) => change('vendorName', e.target.value)}
              />
            </label>
            <label>
              Expense notes (optional)
              <textarea
                maxLength={2000}
                value={input.notes}
                onChange={(e) => change('notes', e.target.value)}
              />
            </label>
          </div>
          <button>Save expense</button>
        </fieldset>
      </form>
      {saved && (
        <>
          <div className={styles.actions}>
            <button
              disabled={busy || paymentLocked}
              onClick={() => void reload()}
            >
              Reload latest expense (discard edits)
            </button>
            <button
              disabled={busy || paymentLocked}
              onClick={() => setConfirm('archive')}
            >
              Archive expense
            </button>
          </div>
          <p>
            Paid {formatINR(saved.paidPaise)} · Outstanding{' '}
            {formatINR(saved.outstandingPaise)}
          </p>
          {saved.warnings.length > 0 && (
            <p role="status" className={styles.warning}>
              Overpayment recorded: {formatINR(saved.overpaidPaise)}. This does
              not offset other expenses.
            </p>
          )}
          <h3>Payments</h3>
          {!saved.payments.length && <p>No payments recorded yet.</p>}
          <ul className={styles.paymentList}>
            {saved.payments.map((p) => (
              <li key={p.id}>
                <strong>{formatINR(p.amountPaise)}</strong> · {p.paidByName} ·{' '}
                {p.paymentDate}
                {p.method ? ` · ${p.method}` : ''}
                {p.notes && <p>{p.notes}</p>}
                <div className={styles.actions}>
                  <button
                    disabled={busy || paymentLocked}
                    onClick={() => setPaymentId(p.id)}
                  >
                    Edit payment by {p.paidByName}
                  </button>
                  <button
                    disabled={busy || paymentLocked}
                    onClick={() => setConfirm(p.id)}
                  >
                    Remove payment by {p.paidByName}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            disabled={busy || paymentLocked}
            onClick={() => setPaymentId(null)}
          >
            Add payment
          </button>
          {paymentId !== undefined && (
            <PaymentEditor
              key={paymentId ?? 'new'}
              expense={saved}
              onLock={onPaymentLock}
              onAuthError={onAuthError}
              paymentId={paymentId}
              onClose={() => setPaymentId(undefined)}
              onSaved={async (e) => {
                setSaved(e);
                setPaymentId(undefined);
                await onSaved(
                  e,
                  paymentId ? 'Payment updated.' : 'Payment recorded.',
                );
              }}
            />
          )}
        </>
      )}
      {confirm && (
        <div
          className={styles.confirm}
          role="region"
          aria-label="Confirm removal"
        >
          <p>
            {confirm === 'archive'
              ? 'Archive this expense? It will leave active lists and totals; its history is preserved.'
              : 'Remove this payment? Paid and outstanding totals will update.'}
          </p>
          <button
            disabled={busy || paymentLocked}
            onClick={() => void remove()}
          >
            Confirm {confirm === 'archive' ? 'archive' : 'payment removal'}
          </button>
          <button
            disabled={busy || paymentLocked}
            onClick={() => setConfirm(null)}
          >
            Cancel removal
          </button>
        </div>
      )}
    </section>
  );
}
function PaymentEditor({
  onLock,
  onAuthError,
  expense,
  paymentId,
  onClose,
  onSaved,
}: {
  expense: Expense;
  onLock: (locked: boolean) => void;
  onAuthError: (e: unknown) => void;
  paymentId: string | null;
  onClose: () => void;
  onSaved: (e: Expense) => Promise<void>;
}) {
  const payment = expense.payments.find((p) => p.id === paymentId),
    session = useSession();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: session.data?.wedding.timezone ?? 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [input, setInput] = useState({
      amount: payment ? paiseToRupees(payment.amountPaise) : '',
      paidByName: payment?.paidByName ?? '',
      paymentDate: payment?.paymentDate ?? today,
      method: payment?.method ?? '',
      notes: payment?.notes ?? '',
    }),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    onLock(busy || uncertain);
  }, [busy, uncertain, onLock]);
  useEffect(() => () => onLock(false), [onLock]);
  const attempt = useRef<{ key: string; input: PaymentInput } | null>(null);
  function change(key: keyof typeof input, value: string) {
    setInput({ ...input, [key]: value });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const parsed = paymentInputSchema.parse({
        amountPaise: rupeesToPaise(input.amount),
        paidByName: input.paidByName,
        paidByUserId: payment?.paidByUserId ?? null,
        paymentDate: input.paymentDate,
        method: input.method,
        notes: input.notes,
      });
      if (!attempt.current || !uncertain)
        attempt.current = { key: crypto.randomUUID(), input: parsed };
      const result = await api.savePayment(
        expense,
        attempt.current.input,
        attempt.current.key,
        paymentId ?? undefined,
      );
      setUncertain(false);
      await onSaved(result);
    } catch (e) {
      setError(e);
      if (e instanceof ApiClientError && e.status === 401) onAuthError(e);
      if (
        !paymentId &&
        (!(e instanceof ApiClientError) || e.status >= 500) &&
        attempt.current
      )
        setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={styles.paymentForm}
      onSubmit={(e) => void save(e)}
      aria-label={paymentId ? 'Edit payment' : 'Add payment'}
    >
      <h3>{paymentId ? 'Edit payment' : 'New payment'}</h3>
      {error !== undefined && <p role="alert">{message(error)}</p>}
      {uncertain && (
        <p role="alert">
          We could not confirm whether this payment was recorded. Retry these
          same details to safely check the original payment before adding
          another. Keep this form open.
        </p>
      )}
      <fieldset disabled={busy || uncertain}>
        <legend>Payment details</legend>
        <div className={styles.grid}>
          <label>
            Payment amount (INR)
            <input
              required
              inputMode="decimal"
              value={input.amount}
              onChange={(e) => change('amount', e.target.value)}
            />
          </label>
          <label>
            Paid by
            <input
              required
              maxLength={120}
              value={input.paidByName}
              onChange={(e) => change('paidByName', e.target.value)}
            />
          </label>
          <label>
            Payment date
            <input
              required
              type="date"
              value={input.paymentDate}
              onChange={(e) => change('paymentDate', e.target.value)}
            />
          </label>
          <label>
            Payment method (optional)
            <input
              maxLength={80}
              placeholder="Cash, bank transfer…"
              value={input.method}
              onChange={(e) => change('method', e.target.value)}
            />
          </label>
          <label>
            Payment notes (optional)
            <textarea
              maxLength={2000}
              value={input.notes}
              onChange={(e) => change('notes', e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <div className={styles.actions}>
        <button disabled={busy}>
          {busy
            ? 'Saving…'
            : uncertain
              ? 'Retry original payment'
              : 'Save payment'}
        </button>
        <button type="button" disabled={busy || uncertain} onClick={onClose}>
          Cancel payment
        </button>
      </div>
    </form>
  );
}
