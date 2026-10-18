import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
const mailSchema = z.strictObject({
  to: z.email(),
  subject: z.string().min(1),
  text: z.string().min(1),
});
export type Mail = z.infer<typeof mailSchema>;
export class EmailVault {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('Email key must contain 32 bytes.');
  }
  seal(mail: Mail, context: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(mail), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  open(payload: string, context: string): Mail {
    const data = Buffer.from(payload, 'base64'),
      decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        data.subarray(0, 12),
      );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(12, 28));
    return mailSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString('utf8'),
      ),
    );
  }
}
export class EmailFailure extends Error {
  constructor(
    public code: string,
    public permanent = false,
  ) {
    super('Email delivery failed.');
  }
}
export interface EmailTransport {
  send(mail: Mail, key: string): Promise<'accepted' | 'outbox'>;
}
export class ResendTransport implements EmailTransport {
  constructor(
    private apiKey: string,
    private from: string,
    private allowed: string[] | null,
    private request: typeof fetch = fetch,
  ) {}
  async send(mail: Mail, key: string) {
    if (this.allowed && !this.allowed.includes(mail.to))
      throw new EmailFailure('RECIPIENT_NOT_ALLOWED', true);
    let response: Response;
    try {
      response = await this.request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          from: this.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new EmailFailure('PROVIDER_UNAVAILABLE');
    }
    if (!response.ok)
      throw new EmailFailure(
        response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_REJECTED',
        response.status >= 400 &&
          response.status < 500 &&
          ![408, 409, 429].includes(response.status),
      );
    const json: unknown = await response.json().catch(() => null);
    if (!z.object({ id: z.string().min(1) }).safeParse(json).success)
      throw new EmailFailure('PROVIDER_INVALID_RESPONSE');
    return 'accepted' as const;
  }
}
export class OutboxTransport implements EmailTransport {
  constructor(private directory: string) {}
  async send(mail: Mail, key: string) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = `${this.directory}/${key.replaceAll('/', '-')}.json`,
      body = JSON.stringify(mail, null, 2) + '\n';
    try {
      await writeFile(path, body, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error;
      if ((await readFile(path, 'utf8')) !== body)
        throw new EmailFailure('OUTBOX_CONFLICT', true);
    }
    return 'outbox' as const;
  }
}
export async function emailRuntime(config: Environment) {
  if (config.EMAIL_MODE === 'disabled') return null;
  const directory = fileURLToPath(new URL('../../.local/', import.meta.url));
  let key = config.EMAIL_ENCRYPTION_KEY;
  if (!key) {
    if (config.NODE_ENV === 'production')
      throw new Error('Email encryption key is required.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = `${directory}/email-key`;
    try {
      await writeFile(path, randomBytes(32).toString('hex'), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error;
    }
    key = (await readFile(path, 'utf8')).trim();
  }
  const vault = new EmailVault(Buffer.from(key, 'hex'));
  const transport: EmailTransport =
    config.EMAIL_MODE === 'resend'
      ? new ResendTransport(
          config.RESEND_API_KEY!,
          config.EMAIL_FROM!,
          config.EMAIL_ALLOWED_RECIPIENTS.length
            ? config.EMAIL_ALLOWED_RECIPIENTS
            : null,
        )
      : new OutboxTransport(`${directory}/outbox`);
  return { vault, transport };
}
