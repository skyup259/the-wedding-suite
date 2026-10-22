import type { ObjectId } from 'mongodb';
import type { AuthSnapshot, WeddingRecord } from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
import type { InvitationRecord } from '../invitations/invitations.types.js';
import type { Mail } from '../../infrastructure/email.js';
export const CAMPAIGNS_MIGRATION = '005-invitation-email';
export type SendKind = 'first';
export interface QuotaRecord {
  _id: ObjectId;
  timezone: string;
  day: string;
  first: number;
}
export interface BatchItem {
  invitationId: ObjectId;
  revision: number;
  dispatchId: ObjectId;
  kind: SendKind;
  sequence: number;
  payload: string | null;
  fingerprint: string;
}
export interface BatchRecord {
  _id: ObjectId;
  weddingId: ObjectId;
  createdBy: ObjectId;
  revision: number;
  status: 'preview' | 'confirmed' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
  mode: 'outbox' | 'resend';
  weddingRevision: number;
  timezone: string;
  day: string;
  items: BatchItem[];
}
export interface DispatchRecord {
  _id: ObjectId;
  weddingId: ObjectId;
  type: 'invitation_email';
  invitationId: ObjectId;
  batchId: ObjectId;
  sequence: number;
  kind: SendKind;
  familyDisplayName: string;
  revision: number;
  invitationRevision: number;
  weddingRevision: number;
  fingerprint: string;
  payload: string | null;
  recipientHash: string;
  messageHash: string;
  idempotencyKey: string;
  mode: 'outbox' | 'resend';
  status:
    | 'queued'
    | 'running'
    | 'accepted'
    | 'outbox'
    | 'failed'
    | 'cancelled'
    | 'unknown';
  delivery:
    | 'pending'
    | 'accepted'
    | 'delayed'
    | 'delivered'
    | 'bounced'
    | 'complained'
    | 'failed';
  providerId: string | null;
  attempts: number;
  nextRunAt: Date;
  leaseOwner: string | null;
  leaseVersion: number;
  leaseUntil: Date | null;
  firstAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  errorCode: string | null;
  retryable: boolean;
}
export interface DeliveryReceipt {
  _id: string;
  providerId: string;
  type: string;
  occurredAt: Date;
  receivedAt: Date;
}
export interface CampaignUnit {
  wedding: WeddingRecord;
  events: EventRecord[];
  invitation(id: ObjectId): Promise<InvitationRecord | null>;
  saveInvitation(record: InvitationRecord): Promise<void>;
  batch(id: ObjectId): Promise<BatchRecord | null>;
  saveBatch(record: BatchRecord): Promise<void>;
  dispatch(id: ObjectId): Promise<DispatchRecord | null>;
  saveDispatch(record: DispatchRecord): Promise<void>;
  dispatches(id: ObjectId): Promise<DispatchRecord[]>;
  quota(): Promise<QuotaRecord | null>;
  saveQuota(record: QuotaRecord): Promise<void>;
  receipts(providerId: string): Promise<DeliveryReceipt[]>;
  audit(
    action: string,
    id: ObjectId,
    now: Date,
    requestId: string,
  ): Promise<void>;
}
export interface CampaignStore {
  ready(): Promise<boolean>;
  transaction<T>(
    weddingId: ObjectId,
    actor: AuthSnapshot | null,
    work: (unit: CampaignUnit) => Promise<T>,
  ): Promise<T>;
  batches(weddingId: ObjectId, after?: ObjectId): Promise<BatchRecord[]>;
  dispatches(weddingId: ObjectId, batchId: ObjectId): Promise<DispatchRecord[]>;
  claim(owner: string, now: Date): Promise<DispatchRecord | null>;
  sweep(now: Date): Promise<void>;
  webhook(
    receipt: DeliveryReceipt,
    apply: (job: DispatchRecord) => void,
  ): Promise<void>;
}
export interface CampaignTransport {
  sendWithReceipt(
    mail: Mail,
    key: string,
  ): Promise<{ outcome: 'accepted' | 'outbox'; providerId: string | null }>;
  retrieve?(id: string): Promise<{
    to: string[];
    subject: string;
    text: string;
    createdAt: Date;
    lastEvent: string;
  }>;
}
