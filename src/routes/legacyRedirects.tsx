import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import type { RouteSpec } from './router';

/**
 * `/training` shipped before the rename to labelled feedback, so bookmarks and
 * links in old tickets still point at it. Record and batch ids carried over
 * with the backend rename, so the old URLs map one to one.
 */
function TrainingRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams();
  if (params.get('tab') === 'runs') next.set('tab', 'batches');
  const review = params.get('review');
  if (review) next.set('review', review);
  const query = next.toString();
  return <Navigate to={`/labelled-feedback${query ? `?${query}` : ''}`} replace />;
}

function TrainingRunRedirect() {
  const { runId = '' } = useParams();
  return <Navigate to={`/labelled-feedback/batches/${encodeURIComponent(runId)}`} replace />;
}

export const LEGACY_ROUTES: RouteSpec[] = [
  { path: 'training', element: <TrainingRedirect /> },
  { path: 'training/runs/:runId', element: <TrainingRunRedirect /> },
];
