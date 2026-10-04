import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchDetailPage from '@/features/labelled-feedback/BatchDetailPage';
import { saveBlob } from '@/lib/download';
import { blobText, isBlobLike } from './blob';
import { renderWithProviders } from './render';
import { WIRE_BATCH, WIRE_BATCH_RECORD, WIRE_DIRECTORY, WIRE_DOWNLOAD_HEADERS } from './wire';

vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));

const SECOND_RECORD = {
  ...WIRE_BATCH_RECORD,
  id: '2b1f0c4e-7d3a-4e8b-9c6f-5a4d3e2b1c0f',
  snapshot: { ...WIRE_BATCH_RECORD.snapshot, external_ref: 'TXN-SECOND-PAGE' },
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The batch in `status`, its records in two pages of one, and its CSV. */
function stubApi(status: string) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://console.test');
      urls.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith('/download')) {
        return new Response('id\r\n', { status: 200, headers: { ...WIRE_DOWNLOAD_HEADERS } });
      }
      if (url.pathname.endsWith('/records')) {
        return url.searchParams.get('cursor') === 'page-2'
          ? json({ items: [SECOND_RECORD], next_cursor: null, page_size: 200 })
          : json({ items: [WIRE_BATCH_RECORD], next_cursor: 'page-2', page_size: 200 });
      }
      return json({ ...WIRE_BATCH, status, record_count: 2 });
    }),
  );
  return urls;
}

function renderBatch() {
  renderWithProviders(
    <MemoryRouter initialEntries={[`/labelled-feedback/batches/${WIRE_BATCH.id}`]}>
      <Routes>
        <Route path="/labelled-feedback/batches/:batchId" element={<BatchDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { scopes: ['feedback:review'], directory: WIRE_DIRECTORY },
  );
  return screen.findByText(WIRE_BATCH.notes);
}

beforeEach(() => vi.mocked(saveBlob).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('BatchDetailPage', () => {
  it('offers no download and no cancel once cancelled', async () => {
    stubApi('CANCELLED');
    await renderBatch();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel batch' })).toBeNull();
  });

  it('offers cancel only while queued', async () => {
    stubApi('QUEUED');
    await renderBatch();
    expect(screen.getByRole('button', { name: 'Cancel batch' })).toBeInTheDocument();
  });

  it('saves the download under the name the server gave it', async () => {
    const urls = stubApi('COMPLETED');
    await renderBatch();
    expect(screen.queryByRole('button', { name: 'Cancel batch' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0]!;
    // The bytes the server sent, not the class that holds them: which `Blob`
    // `Response.blob()` returns under jsdom depends on the Node version (see
    // tests/blob.ts), and `toBeInstanceOf(Blob)` failed on CI's Node 22 alone.
    expect(isBlobLike(blob)).toBe(true);
    expect(await blobText(blob)).toBe('id\r\n');
    expect(filename).toBe('labelled-feedback-october-validated-labels-afe4f9a0.csv');
    expect(urls).toContain(`/v1/labelled-feedback/batches/${WIRE_BATCH.id}/download?format=csv`);
  });

  it('pages through the frozen records', async () => {
    stubApi('COMPLETED');
    await renderBatch();
    expect(await screen.findByText('TXN-2B7E8ECB3266')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('TXN-SECOND-PAGE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
