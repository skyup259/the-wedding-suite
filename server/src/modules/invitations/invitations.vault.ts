import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Environment } from '../../config/env.js';
export class InvitationVault {
  constructor(private key: Buffer) {
    if (key.length !== 32)
      throw new Error('Invitation key must contain 32 bytes.');
  }
  seal(token: string, context: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }
  open(payload: string, context: string) {
    const data = Buffer.from(payload, 'base64'),
      decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        data.subarray(0, 12),
      );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(12, 28));
    const token = Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error('Invalid invitation capability.');
    return token;
  }
}
export async function invitationVault(config: Environment) {
  let key = config.INVITATION_ENCRYPTION_KEY;
  if (!key) {
    if (config.NODE_ENV === 'production') return null;
    const directory = fileURLToPath(
      new URL('../../../.local/', import.meta.url),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = `${directory}/invitation-key`;
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
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new Error('Invalid invitation key configuration.');
  }
  return new InvitationVault(Buffer.from(key, 'hex'));
}
