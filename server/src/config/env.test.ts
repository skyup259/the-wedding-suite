import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env.js';

const valid = {
  APP_ORIGIN: 'http://localhost:5173',
  MONGODB_URI: 'mongodb+srv://user:secret@cluster.example/?authSource=admin',
  MONGODB_DB_NAME: 'marriage_suite_dev',
};

describe('environment configuration', () => {
  it('parses explicit settings and conservative defaults', () => {
    const result = parseEnvironment(valid);
    expect(result.PORT).toBe(3000);
    expect(result.TRUST_PROXY).toBe(false);
  });

  it.each(['admin', 'config', 'local', 'sample_mflix'])(
    'rejects the non-application database %s',
    (name) => {
      expect(() =>
        parseEnvironment({ ...valid, MONGODB_DB_NAME: name }),
      ).toThrow('MONGODB_DB_NAME');
    },
  );

  it('rejects missing/placeholder credentials without disclosing values', () => {
    expect(() =>
      parseEnvironment({
        ...valid,
        MONGODB_URI: 'mongodb+srv://<DB_USER>:<PASSWORD>@<HOST>',
      }),
    ).toThrow('MONGODB_URI');
    expect(() =>
      parseEnvironment({
        ...valid,
        MONGODB_URI: 'secret-that-must-not-appear',
      }),
    ).not.toThrow('secret-that-must-not-appear');
    expect(() =>
      parseEnvironment({ ...valid, MONGODB_URI: undefined }),
    ).toThrow('MONGODB_URI');
  });

  it('rejects ambiguous proxy settings, invalid ports, and non-HTTPS production origins', () => {
    expect(() => parseEnvironment({ ...valid, TRUST_PROXY: '1' })).toThrow(
      'TRUST_PROXY',
    );
    expect(() => parseEnvironment({ ...valid, PORT: '0' })).toThrow('PORT');
    expect(() =>
      parseEnvironment({ ...valid, NODE_ENV: 'production' }),
    ).toThrow('APP_ORIGIN');
    expect(() =>
      parseEnvironment({ ...valid, APP_ORIGIN: 'http://localhost:5173/path' }),
    ).toThrow('APP_ORIGIN');
  });
  it('defaults development to a private outbox and production to disabled email', () => {
    expect(parseEnvironment(valid).EMAIL_MODE).toBe('outbox');
    expect(
      parseEnvironment({
        ...valid,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://wedding.example',
        CSRF_SECRET: 'a-stable-secret-at-least-32-characters',
      }).EMAIL_MODE,
    ).toBe('disabled');
  });
  it('requires sender, key and controlled recipients before non-production Resend delivery', () => {
    expect(() => parseEnvironment({ ...valid, EMAIL_MODE: 'resend' })).toThrow(
      'RESEND_API_KEY',
    );
    expect(() =>
      parseEnvironment({
        ...valid,
        EMAIL_MODE: 'resend',
        RESEND_API_KEY: 'synthetic',
        EMAIL_FROM: 'sender@example.test',
      }),
    ).toThrow('EMAIL_ALLOWED_RECIPIENTS');
    expect(
      parseEnvironment({
        ...valid,
        EMAIL_MODE: 'resend',
        RESEND_API_KEY: 'synthetic',
        EMAIL_FROM: 'sender@example.test',
        EMAIL_ALLOWED_RECIPIENTS: 'test@example.test',
      }).EMAIL_ALLOWED_RECIPIENTS,
    ).toEqual(['test@example.test']);
    expect(() =>
      parseEnvironment({
        ...valid,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://wedding.example',
        CSRF_SECRET: 'a-stable-secret-at-least-32-characters',
        EMAIL_MODE: 'resend',
        RESEND_API_KEY: 'synthetic',
        EMAIL_FROM: 'sender@example.test',
      }),
    ).toThrow('EMAIL_ENCRYPTION_KEY');
  });
});
