import type { ObjectId } from 'mongodb';
import type { AuthData } from '@wedding-suite/shared/auth';

interface RecordBase {
  _id: ObjectId;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface UserRecord extends RecordBase {
  weddingId: ObjectId;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  role: 'admin' | 'manager';
  status: 'active' | 'disabled';
  sessionVersion: number;
  passwordChangedAt: Date;
  teamRevision?: number;
  accessRevision?: number;
}
export interface WeddingRecord extends RecordBase {
  couple: AuthData['wedding']['couple'];
  mainDate: string;
  timezone: string;
  slug: string;
  slugLockedAt: Date | null;
  publicationStatus: 'draft' | 'published';
  publishedAt: Date | null;
  website: {
    themeId: AuthData['wedding']['themeId'];
    intro: string;
    welcomeMessage: string;
    accentColor: string;
    coverPhotoId: null;
  };
  location: null;
  latestAnnouncement: null;
  gallery: {
    uploadsEnabled: boolean;
    privateLinkEnabled: boolean;
    privateLinkVersion: number;
    rotatedAt: null;
  };
  photoExpiryAt: Date;
  retentionVersion: number;
  mediaCleanup: {
    state: 'idle';
    lastAttemptAt: null;
    completedAt: null;
    errorCode: null;
  };
  revision: number;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}
export interface SessionRecord extends RecordBase {
  weddingId: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  sessionVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface AuthSnapshot {
  user: UserRecord;
  wedding: WeddingRecord;
}
export interface RegistrationRecords {
  user: UserRecord;
  wedding: WeddingRecord;
  session: SessionRecord;
  requestId: string;
}
export interface AuthStore {
  ready(): Promise<boolean>;
  findUser(email: string): Promise<UserRecord | null>;
  resolve(tokenHash: string, now: Date): Promise<AuthSnapshot | null>;
  register(records: RegistrationRecords, previousHash?: string): Promise<void>;
  loginSession(
    user: UserRecord,
    session: SessionRecord,
    previousHash?: string,
  ): Promise<AuthSnapshot | null>;
  revoke(tokenHash: string, now: Date): Promise<void>;
  consume(key: string, expiresAt: Date): Promise<number>;
}
export class DuplicateAccountError extends Error {
  constructor(public readonly field: 'email' | 'slug') {
    super('Duplicate account data');
  }
}
