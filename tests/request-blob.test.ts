import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRefreshState,
  filenameFromDisposition,
  requestBlob,
  route,
} from '@/api/client';
import { downloadExportBatch } from '@/api/endpoints/labelledFeedback';
import { tokenStore } from '@/auth/tokenStore';
import { saveBlob } from '@/lib/download';
import { ApiError } from '@/lib/problem';
import { blobText } from './blob';
import { WIRE_DOWNLOAD_CSV_HEADER, WIRE_DOWNLOAD_HEADERS } from './wire';

const BATCH = 'afe4f9a0-4cdb-4de3-a18f-202cfeaa38a1';

function seedSession() {
  tokenStore.set({
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-1',
    token_type: 'bearer',
    expires_in: 900,
    scopes: ['feedback:review'],
  });
}

function fileResponse(body: string, headers: Record<string, string> = { ...WIRE_DOWNLOAD_HEADERS }) {
  return new Response(body, { status: 200, headers });
}

function problemResponse(status: number, detail: string) {
  return new Response(
    JSON.stringify({ type: 'about:blank', title: 'Conflict', status, detail, instance: '/x' }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

beforeEach(() => {
  __resetRefreshState();
  seedSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetRefreshState();
  tokenStore.clear();
});

describe('filenameFromDisposition', () => {
  it('reads the live header', () => {
    expect(filenameFromDisposition(WIRE_DOWNLOAD_HEADERS['content-disposition'])).toBe(
      'labelled-feedback-october-validated-labels-afe4f9a0.csv',
    );
  });

  it('prefers the RFC 5987 form and decodes it', () => {
    expect(
      filenameFromDisposition(
        `attachment; filename="fallback.csv"; filename*=UTF-8''r%C3%A9sum%C3%A9.csv`,
      ),
    ).toBe('résumé.csv');
  });

  it('accepts an unquoted name', () => {
    expect(filenameFromDisposition('attachment; filename=batch.jsonl')).toBe('batch.jsonl');
  });

  it('drops any directory part', () => {
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"')).toBe('passwd');
    expect(filenameFromDisposition('attachment; filename="..\\\\evil.csv"')).toBe('evil.csv');
  });

  it('returns null when there is nothing usable', () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition('attachment')).toBeNull();
  });
});

describe('requestBlob', () => {
  it('returns the body and the server-named file', async () => {
    const fetchMock = vi.fn(async () => fileResponse(`${WIRE_DOWNLOAD_CSV_HEADER}\r\n`));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestBlob(
      route('/v1/labelled-feedback/batches/{batch_id}/download', { batch_id: BATCH }, { format: 'csv' }),
    );

    expect(result.filename).toBe('labelled-feedback-october-validated-labels-afe4f9a0.csv');
    expect(await blobText(result.blob)).toContain('analyst_findings');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/v1/labelled-feedback/batches/${BATCH}/download?format=csv`);
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer header.payload.signature');
    expect(headers['Accept']).toBe('*/*');
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/auth/refresh')) {
          return new Response(
            JSON.stringify({
              access_token: 'header.fresh.signature',
              refresh_token: 'refresh-2',
              token_type: 'bearer',
              expires_in: 900,
              scopes: ['feedback:review'],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const auth = (init?.headers as Record<string, string>)['Authorization'] ?? '';
        seen.push(auth);
        return auth === 'Bearer header.fresh.signature'
          ? fileResponse('{"id": 1}\n', {
              'Content-Type': 'application/x-ndjson',
              'Content-Disposition': 'attachment; filename="batch.jsonl"',
            })
          : problemResponse(401, 'Token expired.');
      }),
    );

    const result = await requestBlob(
      route('/v1/labelled-feedback/batches/{batch_id}/download', { batch_id: BATCH }, { format: 'jsonl' }),
    );

    expect(seen).toEqual(['Bearer header.payload.signature', 'Bearer header.fresh.signature']);
    expect(result.filename).toBe('batch.jsonl');
    expect(await blobText(result.blob)).toBe('{"id": 1}\n');
  });

  it('turns a problem response into an ApiError, not a file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problemResponse(409, 'A cancelled batch cannot be downloaded.')),
    );

    const attempt = requestBlob(
      route('/v1/labelled-feedback/batches/{batch_id}/download', { batch_id: BATCH }),
    );
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      message: 'A cancelled batch cannot be downloaded.',
    });
  });
});

describe('downloadExportBatch', () => {
  it('names the file itself when the server does not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fileResponse('x\n', { 'Content-Type': 'text/csv' })));
    const { filename } = await downloadExportBatch(BATCH, 'csv');
    expect(filename).toBe('labelled-feedback-afe4f9a0.csv');
  });
});

describe('saveBlob', () => {
  it('keeps the object URL alive long enough for the browser to read it', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    // jsdom has neither, and cannot follow the click.
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = () => 'blob:batch';
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      saveBlob(new Blob(['x']), 'batch.csv');
      vi.advanceTimersByTime(9_999);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revoke).toHaveBeenCalledWith('blob:batch');
    } finally {
      vi.useRealTimers();
      click.mockRestore();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
  });
});
