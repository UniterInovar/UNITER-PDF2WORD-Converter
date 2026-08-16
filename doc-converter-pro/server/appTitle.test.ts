import { describe, expect, it } from 'vitest';
import { ENV } from './_core/env';

describe('application title configuration', () => {
  it('uses the supplied title when calling a lightweight project endpoint', async () => {
    expect(ENV.appTitle).toBe('UNITER document converter');

    const response = await fetch('http://127.0.0.1:3000/api/history?sessionId=app-title-validation', {
      headers: { 'x-app-title': ENV.appTitle },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).history).toEqual([]);
  });
});
