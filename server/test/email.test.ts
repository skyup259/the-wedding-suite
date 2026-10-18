import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EmailVault,
  OutboxTransport,
  ResendTransport,
} from '../src/infrastructure/email.js';
const mail = {
  to: 'test@example.test',
  subject: 'Synthetic subject',
  text: 'Synthetic message',
};
describe('email envelope and transports', () => {
  it('authenticates ciphertext and binds it to its job', () => {
    const vault = new EmailVault(Buffer.alloc(32, 2));
    const sealed = vault.seal(mail, 'job-one');
    expect(vault.open(sealed, 'job-one')).toEqual(mail);
    expect(() => vault.open(sealed, 'job-two')).toThrow();
    const bytes = Buffer.from(sealed, 'base64');
    bytes[30] = bytes[30]! ^ 1;
    expect(() => vault.open(bytes.toString('base64'), 'job-one')).toThrow();
  });
  it('writes an idempotent private outbox without changing an existing message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-email-'));
    try {
      const outbox = new OutboxTransport(dir);
      await expect(outbox.send(mail, 'auth-email/test')).resolves.toBe(
        'outbox',
      );
      await outbox.send(mail, 'auth-email/test');
      const path = join(dir, 'auth-email-test.json');
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(mail);
      await expect(
        outbox.send({ ...mail, text: 'changed' }, 'auth-email/test'),
      ).rejects.toMatchObject({ code: 'OUTBOX_CONFLICT' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('restricts non-production recipients and sends a stable Resend idempotency key', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'synthetic-id' }), { status: 200 }),
      );
    const sender = new ResendTransport(
      'synthetic-key',
      'sender@example.test',
      ['test@example.test'],
      request,
    );
    await expect(
      sender.send({ ...mail, to: 'blocked@example.test' }, 'test-key'),
    ).rejects.toMatchObject({ code: 'RECIPIENT_NOT_ALLOWED', permanent: true });
    expect(request).not.toHaveBeenCalled();
    await expect(sender.send(mail, 'test-key')).resolves.toBe('accepted');
    expect(request.mock.calls[0]![0]).toBe('https://api.resend.com/emails');
    expect(request.mock.calls[0]![1]!.headers).toMatchObject({
      'Idempotency-Key': 'test-key',
    });
  });
  it('classifies throttling and authentication errors without exposing provider diagnostics', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('private diagnostics', { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response('private diagnostics', { status: 401 }),
      );
    const sender = new ResendTransport(
      'synthetic-key',
      'sender@example.test',
      null,
      request,
    );
    await expect(sender.send(mail, 'key')).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      permanent: false,
      message: 'Email delivery failed.',
    });
    await expect(sender.send(mail, 'key')).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
      permanent: true,
    });
  });
});
