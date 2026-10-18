import { describe, it, expect } from 'vitest';
import {
  eventInputSchema,
  eventPatchSchema,
  weddingPatchSchema,
  mapUrlSchema,
  publicEventSchema,
} from './website.js';
const event = {
  name: 'Mehendi',
  description: '',
  startAt: '2026-12-30T10:00:00.000Z',
  endAt: null,
  venue: { name: '', address: '', mapUrl: '' },
  contacts: [],
  dressCode: '',
  instructions: '',
  status: 'not_started',
  sortOrder: 0,
  stream: null,
};
describe('website contracts', () => {
  it('allows incomplete event drafts but validates order, contacts and strict fields', () => {
    expect(eventInputSchema.safeParse(event).success).toBe(true);
    expect(
      eventInputSchema.safeParse({
        ...event,
        endAt: '2026-12-29T10:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...event, weddingId: 'wrong' }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({
        ...event,
        contacts: [{ name: 'Contact', phone: 'bad' }],
      }).success,
    ).toBe(false);
  });
  it('accepts partial event changes for merging but never client-assigned ownership', () => {
    expect(eventPatchSchema.parse({ status: 'in_progress' })).toEqual({
      status: 'in_progress',
    });
    expect(eventPatchSchema.safeParse({ updatedBy: 'attacker' }).success).toBe(
      false,
    );
    expect(
      weddingPatchSchema.safeParse({ slug: 'new-address', revision: 20 })
        .success,
    ).toBe(false);
  });
  it('rejects executable or credential-bearing links', () => {
    expect(mapUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(
      mapUrlSchema.safeParse('https://user:secret@example.test/').success,
    ).toBe(false);
    expect(mapUrlSchema.parse('https://maps.google.com/')).toBe(
      'https://maps.google.com/',
    );
  });
  it('constructs the public event schema without refined-object omit failures', () => {
    expect(
      publicEventSchema.parse({
        ...event,
        id: 'event',
        updatedAt: '2026-10-18T10:00:00Z',
      }).name,
    ).toBe('Mehendi');
  });
});
