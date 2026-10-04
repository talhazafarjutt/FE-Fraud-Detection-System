import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LEGACY_ROUTES } from '@/routes/legacyRedirects';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function landAt(url: string): string {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        children: [
          ...LEGACY_ROUTES,
          { path: 'labelled-feedback', element: <Where /> },
          { path: 'labelled-feedback/batches/:batchId', element: <Where /> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  const { unmount } = render(<RouterProvider router={router} />);
  const landed = screen.getByTestId('where').textContent ?? '';
  unmount();
  return landed;
}

describe('pre-rename training URLs', () => {
  it('sends /training to labelled feedback', () => {
    expect(landAt('/training')).toBe('/labelled-feedback');
  });

  it('keeps the runs tab and a review deep link', () => {
    expect(landAt('/training?tab=runs')).toBe('/labelled-feedback?tab=batches');
    expect(landAt('/training?review=4f86c685-3fcf-430e-9b37-e14ae5a64343')).toBe(
      '/labelled-feedback?review=4f86c685-3fcf-430e-9b37-e14ae5a64343',
    );
  });

  it('sends a run to the batch with the same id', () => {
    expect(landAt('/training/runs/afe4f9a0-4cdb-4de3-a18f-202cfeaa38a1')).toBe(
      '/labelled-feedback/batches/afe4f9a0-4cdb-4de3-a18f-202cfeaa38a1',
    );
  });

  it('cannot be steered off the batch route by the id', () => {
    expect(landAt('/training/runs/..%2F..%2Fusers')).toBe(
      '/labelled-feedback/batches/..%2F..%2Fusers',
    );
  });
});
