import { Link } from 'react-router-dom';
import { Eyebrow } from './primitives';

export function NotFound() {
  return (
    <div className="border border-rule bg-surface p-10">
      <Eyebrow>404</Eyebrow>
      <h2 className="mb-3">This screen does not exist.</h2>
      <p className="mb-6 text-ink-2">The address you followed is not part of the console.</p>
      <Link to="/" className="btn btn--ghost">
        Return to console
      </Link>
    </div>
  );
}
