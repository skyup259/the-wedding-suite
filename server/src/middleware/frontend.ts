import { HttpError } from './errors.js';
import type { WebsiteService } from '../modules/website/website.service.js';
import type { GuestModel } from '@wedding-suite/shared/website';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';

export function mountFrontend(
  app: Express,
  clientDirectory: string,
  website?: WebsiteService,
  origin?: string,
): void {
  const directory = path.resolve(clientDirectory);
  const indexFile = path.join(directory, 'index.html');
  if (!existsSync(indexFile))
    throw new Error('Frontend build missing. Run npm run build first.');

  if (website) {
    const template = readFileSync(indexFile, 'utf8');
    app.get('/w/:slug', async (req, res, next) => {
      if (!req.accepts('html')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      try {
        const model = await website.public(String(req.params.slug));
        res.type('html').send(guestHtml(template, model, origin));
      } catch (error) {
        if (error instanceof HttpError && [404, 503].includes(error.status)) {
          res.status(error.status).type('html').send(template);
          return;
        }
        throw error;
      }
    });
  }
  app.get('/w/:slug/invite/:token', (req, res, next) => {
    if (!req.accepts('html')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Generic HTML only: family names and capabilities never enter social metadata.
    res.sendFile(indexFile);
  });
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

const htmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function guestHtml(
  template: string,
  model: GuestModel,
  origin?: string,
) {
  const names = `${model.wedding.couple.partner1Name} & ${model.wedding.couple.partner2Name}`;
  const title = htmlEscape(`${names} · Wedding celebrations`),
    description = htmlEscape(
      (
        model.wedding.website.intro ||
        `Celebrate the wedding of ${names}. Find ceremony times, venues and contacts.`
      )
        .replace(/\s+/g, ' ')
        .slice(0, 160),
    );
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      '</head>',
      `<meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:type" content="website" /><meta name="twitter:card" content="summary" />${origin ? `<meta property="og:url" content="${htmlEscape(origin + '/w/' + encodeURIComponent(model.wedding.slug))}" />` : ''}</head>`,
    );
}
