import { it, expect } from 'vitest';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
it('authenticates recoverable invitation tokens against wedding/record/version and detects tampering or key mismatch', () => {
  const vault = new InvitationVault(Buffer.alloc(32, 7)),
    token = 'a'.repeat(64),
    context = 'wedding:invitation:1',
    ciphertext = vault.seal(token, context);
  expect(ciphertext).not.toContain(token);
  expect(vault.open(ciphertext, context)).toBe(token);
  expect(() => vault.open(ciphertext, 'other-wedding:invitation:1')).toThrow();
  expect(() => vault.open(ciphertext, 'wedding:invitation:2')).toThrow();
  const damaged = Buffer.from(ciphertext, 'base64');
  damaged[30] = damaged[30]! ^ 1;
  expect(() => vault.open(damaged.toString('base64'), context)).toThrow();
  expect(() =>
    new InvitationVault(Buffer.alloc(32, 9)).open(ciphertext, context),
  ).toThrow();
});
