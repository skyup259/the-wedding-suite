import { describe, it, expect } from 'vitest';
import {
  inviteSchema,
  acceptManagerSchema,
  resetConfirmSchema,
  memberStatusSchema,
} from './access.js';
describe('access contracts', () => {
  it('normalises invitations without permitting role or wedding assignment', () => {
    expect(
      inviteSchema.parse({
        email: ' Test+team@Example.Test ',
        displayName: ' Helper ',
      }),
    ).toEqual({ email: 'test+team@example.test', displayName: 'Helper' });
    expect(
      inviteSchema.safeParse({ email: 'test@example.test', role: 'admin' })
        .success,
    ).toBe(false);
  });
  it('requires high entropy link shape and the existing password policy', () => {
    expect(
      acceptManagerSchema.safeParse({
        token: 'short',
        displayName: 'Helper',
        password: 'a synthetic long passphrase',
      }).success,
    ).toBe(false);
    expect(
      resetConfirmSchema.safeParse({
        token: 'a'.repeat(64),
        newPassword: 'short',
      }).success,
    ).toBe(false);
    expect(
      resetConfirmSchema.safeParse({
        token: 'a'.repeat(64),
        newPassword: 'a synthetic long passphrase',
      }).success,
    ).toBe(true);
  });
  it('only permits enabled/disabled Manager state changes', () => {
    expect(
      memberStatusSchema.safeParse({ status: 'disabled', role: 'admin' })
        .success,
    ).toBe(false);
    expect(memberStatusSchema.parse({ status: 'active' })).toEqual({
      status: 'active',
    });
  });
});
