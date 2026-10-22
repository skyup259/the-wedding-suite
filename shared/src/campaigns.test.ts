import { it, expect } from 'vitest';
import { emailPreviewInputSchema } from './campaigns.js';
import { invitationInputSchema, invitationPatchSchema } from './invitations.js';
it('bounds and deduplicates the reviewed family selection and rejects unapproved resend controls', () => {
  const id = 'a'.repeat(24);
  expect(
    emailPreviewInputSchema.parse({ invitationIds: [id] }).invitationIds,
  ).toEqual([id]);
  for (const input of [
    { invitationIds: [] },
    { invitationIds: [id, id] },
    { invitationIds: Array(26).fill(id) },
    { invitationIds: [id], resend: true },
  ])
    expect(emailPreviewInputSchema.safeParse(input).success).toBe(false);
});
it('normalizes optional family email while partial contact edits leave existing email untouched', () => {
  const input = {
    familyDisplayName: 'Family',
    contactName: 'Contact',
    eventIds: ['a'.repeat(24)],
    email: ' FAMILY@EXAMPLE.TEST ',
  };
  expect(invitationInputSchema.parse(input).email).toBe('family@example.test');
  expect(
    invitationPatchSchema.parse({ contactName: 'Changed' }),
  ).not.toHaveProperty('email');
  expect(
    invitationInputSchema.safeParse({ ...input, email: 'invalid' }).success,
  ).toBe(false);
});
