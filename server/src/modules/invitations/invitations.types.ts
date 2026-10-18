import type { ObjectId } from 'mongodb';
import type { InvitationInput } from '@wedding-suite/shared/invitations';
import type { AuthSnapshot, WeddingRecord } from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
export interface InvitationRecord extends Omit<InvitationInput, 'eventIds'> {
  _id: ObjectId;
  weddingId: ObjectId;
  eventIds: ObjectId[];
  tokenHash: string;
  tokenCiphertext: string;
  tokenKeyVersion: number;
  tokenVersion: number;
  revision: number;
  sentStatus: 'sent' | 'not_sent';
  sentAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  schemaVersion: number;
}
export interface InvitationContext {
  wedding: WeddingRecord;
  events: EventRecord[];
  invitation: InvitationRecord | null;
}
export interface InvitationFilter {
  search: string;
  sentStatus?: 'sent' | 'not_sent';
  eventId?: ObjectId;
  limit: number;
  after?: { date: Date; id: ObjectId };
}
export interface InvitationOverview {
  wedding: WeddingRecord;
  events: EventRecord[];
  totalFamilies: number;
  sentFamilies: number;
  counts: Record<string, number>;
}
export interface InvitationStore {
  ready(): Promise<boolean>;
  read(weddingId: ObjectId, id: ObjectId): Promise<InvitationContext | null>;
  list(
    weddingId: ObjectId,
    filter: InvitationFilter,
  ): Promise<InvitationRecord[]>;
  overview(weddingId: ObjectId): Promise<InvitationOverview | null>;
  publicRead(
    slug: string,
    tokenHash: string,
  ): Promise<InvitationContext | null>;
  mutate(
    actor: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (context: InvitationContext) => InvitationRecord,
    requestId: string,
  ): Promise<InvitationContext>;
}
