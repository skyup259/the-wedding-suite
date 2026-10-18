import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';

export function mountFrontend(app: Express, clientDirectory: string): void {
  const directory = path.resolve(clientDirectory);
  const indexFile = path.join(directory, 'index.html');
  if (!existsSync(indexFile))
    throw new Error('Frontend build missing. Run npm run build first.');

  app.use(
    express.static(directory, {
      index: false,
      redirect: false,
      dotfiles: 'deny',
    }),
  );
  app.use((req, res, next) => {
    const isNavigation = req.method === 'GET' && Boolean(req.accepts('html'));
    const isAsset =
      req.path === '/assets' ||
      req.path.startsWith('/assets/') ||
      path.extname(req.path) !== '' ||
      req.path.split('/').some((segment) => segment.startsWith('.'));
    if (!isNavigation || isAsset) {
      next();
      return;
    }
    // HTML must be revalidated; secret-link pages must never be cached.
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexFile);
  });
}
