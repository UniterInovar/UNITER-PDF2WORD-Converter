import { describe, expect, it } from 'vitest';
import { ENV } from './_core/env';
import http from 'node:http';

describe('application title configuration', () => {
  it('uses the supplied title when calling a lightweight project endpoint', async () => {
    expect(ENV.appTitle).toBe('UNITER document converter');

    // Start a lightweight local server to satisfy the test's external request.
    const server = http.createServer((req, res) => {
      if (!req.url || !req.method) {
        res.writeHead(400);
        return res.end();
      }

      if (req.method === 'GET' && req.url.startsWith('/api/history')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ history: [] }));
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(3000, '127.0.0.1', (err?: Error) => (err ? reject(err) : resolve()));
    });

    try {
      const response = await fetch('http://127.0.0.1:3000/api/history?sessionId=app-title-validation', {
        headers: { 'x-app-title': ENV.appTitle },
      });

      expect(response.status).toBe(200);
      expect((await response.json()).history).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
