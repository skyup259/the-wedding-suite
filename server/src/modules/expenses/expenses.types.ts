import type { Long, ObjectId } from 'mongodb';
import type {
  ExpenseInput,
  PaymentInput,
} from '@wedding-suite/shared/expenses';
import type { AuthSnapshot, UserRecord } from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
export interface PaymentRecord extends Omit<
  PaymentInput,
  'amountPaise' | 'paidByUserId'
> {
  _id: ObjectId;
  amountPaise: Long;
  paidByUserId: ObjectId | null;
  createdAt: Date;
  createdBy: ObjectId;
}
export interface ExpenseRecord extends Omit<
  ExpenseInput,
  'eventId' | 'costPaise'
> {
  _id: ObjectId;
  weddingId: ObjectId;
  eventId: ObjectId | null;
  costPaise: Long;
  currency: 'INR';
  payments: PaymentRecord[];
  paymentRequests: { key: string; hash: string; paymentId: ObjectId }[];
  revision: number;
  schemaVersion: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}
export interface ExpenseFilter {
  eventId?: string | undefined;
  category?: string | undefined;
  payerName?: string | undefined;
  payerUserId?: string | undefined;
}
export interface ExpenseContext {
  expense: ExpenseRecord | null;
  events: EventRecord[];
  members: UserRecord[];
}
export interface ExpenseStore {
  ready(): Promise<boolean>;
  get(weddingId: ObjectId, id: ObjectId): Promise<ExpenseRecord | null>;
  scan(
    weddingId: ObjectId,
    filter: ExpenseFilter,
  ): AsyncIterable<ExpenseRecord>;
  mutate(
    actor: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (c: ExpenseContext) => ExpenseRecord,
    requestId: string,
  ): Promise<ExpenseRecord>;
}
