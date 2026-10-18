import pino from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    // HTTP serializers are allowlists; redact common secret fields as a second layer.
    redact: {
      paths: [
        'password',
        'token',
        'cookie',
        'authorization',
        'MONGODB_URI',
        'req.headers',
        'req.body',
        'res.headers',
      ],
      censor: '[REDACTED]',
    },
  });
}
