import { randomUUID } from 'node:crypto';
import type { Db, Document } from 'mongodb';
import { CAMPAIGNS_MIGRATION } from '../modules/campaigns/campaigns.types.js';
export async function migrateCampaigns(db: Db) {
  const history = db.collection<{
      _id: string;
      owner?: string;
      acquiredAt?: Date;
      appliedAt?: Date;
    }>('schemaMigrations'),
    owner = randomUUID();
  await history.insertOne({
    _id: '__migration_lock',
    owner,
    acquiredAt: new Date(),
  });
  try {
    if (await history.findOne({ _id: CAMPAIGNS_MIGRATION })) return;
    if (
      !(await history.findOne({ _id: '004-family-invitations' })) ||
      !(await history.findOne({ _id: '002-team-recovery' }))
    )
      throw new Error(
        'Apply invitation and email foundation migrations first.',
      );
    const oid = { bsonType: 'objectId' },
      str = { bsonType: 'string' },
      date = { bsonType: 'date' },
      nullableDate = { bsonType: ['date', 'null'] },
      integer = { bsonType: 'int', minimum: 0 },
      positive = { bsonType: 'int', minimum: 1 };
    const invitation = (
      await db
        .listCollections({ name: 'invitations' }, { nameOnly: false })
        .toArray()
    )[0]!.options!.validator as Document;
    invitation.$and[0].$jsonSchema.properties.email = {
      bsonType: 'string',
      maxLength: 254,
    };
    invitation.$and[0].$jsonSchema.properties.emailSequence = integer;
    invitation.$and[0].$jsonSchema.properties.emailLastQueuedAt = date;
    await db.command({
      collMod: 'invitations',
      validator: invitation,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    const familyJob = {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'weddingId',
        'type',
        'invitationId',
        'familyDisplayName',
        'batchId',
        'sequence',
        'kind',
        'revision',
        'invitationRevision',
        'weddingRevision',
        'fingerprint',
        'payload',
        'recipientHash',
        'messageHash',
        'idempotencyKey',
        'mode',
        'status',
        'delivery',
        'providerId',
        'attempts',
        'nextRunAt',
        'leaseOwner',
        'leaseVersion',
        'leaseUntil',
        'firstAttemptAt',
        'createdAt',
        'updatedAt',
        'errorCode',
        'retryable',
      ],
      properties: {
        _id: oid,
        weddingId: oid,
        type: { enum: ['invitation_email'] },
        invitationId: oid,
        familyDisplayName: { bsonType: 'string', minLength: 1, maxLength: 120 },
        batchId: oid,
        sequence: positive,
        kind: { enum: ['first'] },
        revision: positive,
        invitationRevision: positive,
        weddingRevision: positive,
        fingerprint: str,
        payload: { bsonType: ['string', 'null'] },
        recipientHash: str,
        messageHash: str,
        idempotencyKey: str,
        mode: { enum: ['outbox', 'resend'] },
        status: {
          enum: [
            'queued',
            'running',
            'accepted',
            'outbox',
            'failed',
            'cancelled',
            'unknown',
          ],
        },
        delivery: {
          enum: [
            'pending',
            'accepted',
            'delayed',
            'delivered',
            'bounced',
            'complained',
            'failed',
          ],
        },
        providerId: { bsonType: ['string', 'null'] },
        attempts: integer,
        nextRunAt: date,
        leaseOwner: { bsonType: ['string', 'null'] },
        leaseVersion: integer,
        leaseUntil: nullableDate,
        firstAttemptAt: nullableDate,
        createdAt: date,
        updatedAt: date,
        errorCode: { bsonType: ['string', 'null'] },
        retryable: { bsonType: 'bool' },
      },
    };
    const jobs = (
      await db.listCollections({ name: 'jobs' }, { nameOnly: false }).toArray()
    )[0]!.options!.validator as Document;
    await db.command({
      collMod: 'jobs',
      validator: {
        $or: [jobs.$or ? jobs.$or[0] : jobs, { $jsonSchema: familyJob }],
      },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    const audit = (
      await db
        .listCollections({ name: 'auditLogs' }, { nameOnly: false })
        .toArray()
    )[0]!.options!.validator as Document;
    const baseAudit = audit.$jsonSchema ? audit : audit.$and[0];
    baseAudit.$jsonSchema.properties.actorId = {
      bsonType: ['objectId', 'null'],
    };
    await db.command({
      collMod: 'auditLogs',
      validator: {
        $and: [
          baseAudit,
          {
            $expr: {
              $or: [
                { $eq: ['$actorType', 'system'] },
                { $ne: ['$actorId', null] },
              ],
            },
          },
        ],
      },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    const schemas: Record<string, Document> = {
      emailProviderFences: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['_id', 'revision'],
        properties: { _id: str, revision: positive },
      },
      invitationEmailBatches: {
        bsonType: 'object',
        additionalProperties: false,
        required: [
          '_id',
          'weddingId',
          'createdBy',
          'revision',
          'status',
          'createdAt',
          'expiresAt',
          'mode',
          'weddingRevision',
          'timezone',
          'day',
          'items',
        ],
        properties: {
          _id: oid,
          weddingId: oid,
          createdBy: oid,
          revision: positive,
          status: { enum: ['preview', 'confirmed', 'cancelled'] },
          createdAt: date,
          expiresAt: date,
          mode: { enum: ['outbox', 'resend'] },
          weddingRevision: positive,
          timezone: str,
          day: str,
          items: {
            bsonType: 'array',
            minItems: 1,
            maxItems: 25,
            items: {
              bsonType: 'object',
              required: [
                'invitationId',
                'revision',
                'dispatchId',
                'kind',
                'sequence',
                'payload',
                'fingerprint',
              ],
              properties: {
                invitationId: oid,
                revision: positive,
                dispatchId: oid,
                kind: { enum: ['first'] },
                sequence: positive,
                payload: { bsonType: ['string', 'null'] },
                fingerprint: str,
              },
            },
          },
        },
      },
      invitationEmailQuotas: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['_id', 'timezone', 'day', 'first'],
        properties: {
          _id: oid,
          timezone: str,
          day: str,
          first: { bsonType: 'int', minimum: 0, maximum: 25 },
        },
      },
      emailWebhookReceipts: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['_id', 'providerId', 'type', 'occurredAt', 'receivedAt'],
        properties: {
          _id: str,
          providerId: str,
          type: str,
          occurredAt: date,
          receivedAt: date,
        },
      },
    };
    for (const [name, schema] of Object.entries(schemas)) {
      if ((await db.listCollections({ name }).toArray()).length)
        await db.command({
          collMod: name,
          validator: { $jsonSchema: schema },
          validationLevel: 'strict',
          validationAction: 'error',
        });
      else
        await db.createCollection(name, {
          validator: { $jsonSchema: schema },
          validationLevel: 'strict',
          validationAction: 'error',
        });
    }
    await db
      .collection('invitationEmailBatches')
      .createIndex(
        { weddingId: 1, _id: -1 },
        { name: 'wedding_email_batches' },
      );
    await db.collection('jobs').createIndex(
      { weddingId: 1, invitationId: 1, sequence: 1 },
      {
        unique: true,
        partialFilterExpression: { type: 'invitation_email' },
        name: 'unique_family_dispatch',
      },
    );
    await db.collection('jobs').createIndex(
      { providerId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          type: 'invitation_email',
          providerId: { $type: 'string' },
        },
        name: 'unique_provider_email',
      },
    );
    await db
      .collection('jobs')
      .createIndex(
        { type: 1, status: 1, nextRunAt: 1, leaseUntil: 1 },
        { name: 'family_email_claim' },
      );
    await db
      .collection('jobs')
      .createIndex(
        { weddingId: 1, batchId: 1, _id: 1 },
        { name: 'batch_dispatches' },
      );
    await db
      .collection('emailWebhookReceipts')
      .createIndex({ providerId: 1 }, { name: 'provider_receipts' });
    await history.insertOne({
      _id: CAMPAIGNS_MIGRATION,
      appliedAt: new Date(),
    });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
