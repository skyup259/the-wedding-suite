import type { ObjectId } from 'mongodb';
import type { EventInput } from '@wedding-suite/shared/website';
import type { AuthSnapshot, WeddingRecord } from '../auth/auth.types.js';
export interface EventRecord extends Omit<EventInput, 'startAt' | 'endAt'> {
  _id: ObjectId;
  weddingId: ObjectId;
  startAt: Date;
  endAt: Date | null;
  revision: number;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  archivedAt: Date | null;
}
export interface WebsiteSnapshot {
  wedding: WeddingRecord;
  events: EventRecord[];
  references: Record<string, number>;
}
export interface WebsiteChange {
  wedding: WeddingRecord;
  event?: EventRecord;
  action: string;
  entityId: ObjectId;
}
export interface WebsiteStore {
  ready(): Promise<boolean>;
  read(weddingId: ObjectId): Promise<WebsiteSnapshot | null>;
  publicRead(slug: string): Promise<WebsiteSnapshot | null>;
  mutate(
    actor: AuthSnapshot,
    work: (snapshot: WebsiteSnapshot) => WebsiteChange,
    referencedEvent?: ObjectId,
    requestId?: string,
  ): Promise<WebsiteChange>;
}
