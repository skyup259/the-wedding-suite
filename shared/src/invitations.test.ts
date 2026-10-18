import { describe, it, expect } from 'vitest';
import {
  invitationInputSchema,
  invitationPatchSchema,
  invitationRotationResponseSchema,
} from './invitations.js';
const input = {
  familyDisplayName: ' Family ',
  contactName: 'Contact',
  eventIds: ['a'.repeat(24)],
};
describe('family invitation contracts', () => {
  it('normalizes names and optional phone while rejecting empty, duplicate and unknown fields', () => {
    expect(invitationInputSchema.parse(input)).toMatchObject({
      familyDisplayName: 'Family',
      phone: '',
    });
    for (const invalid of [
      { ...input, eventIds: [] },
      { ...input, eventIds: ['a'.repeat(24), 'a'.repeat(24)] },
      { ...input, rsvp: true },
      { ...input, phone: 'invalid' },
      { ...input, familyDisplayName: ' ' },
    ])
      expect(invitationInputSchema.safeParse(invalid).success).toBe(false);
  });
  it('accepts partial contact changes but rejects empty patches and permissions fields', () => {
    expect(
      invitationPatchSchema.parse({ contactName: ' New contact ' }),
    ).toEqual({ contactName: 'New contact' });
    expect(invitationPatchSchema.safeParse({}).success).toBe(false);
    expect(
      invitationPatchSchema.safeParse({ sentStatus: 'sent' }).success,
    ).toBe(false);
  });
});

it('accepts the dedicated rotation response with its explicit share payload', () => {
  const record = {
    ...invitationInputSchema.parse(input),
    id: 'b'.repeat(24),
    revision: 2,
    sentStatus: 'not_sent',
    sentAt: null,
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    archivedEventIds: [],
    share: {
      url: 'https://example.test/invite',
      message: 'Test invitation',
      whatsappUrl: 'https://wa.me/?text=test',
    },
  };
  expect(
    invitationRotationResponseSchema.parse({
      data: record,
      meta: { requestId: 'test' },
    }).data.share,
  ).toEqual(record.share);
});
