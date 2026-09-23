import { useEffect, useState } from 'react';

/** Tailwind's `md` breakpoint, so JS and CSS agree on what "desktop" means. */
const DESKTOP = '(min-width: 768px)';

/**
 * Whether the viewport is at least Tailwind's `md`.
 *
 * Used to decide whether explanatory sections start open. A `<details>` cannot
 * be forced open by CSS in every browser, and shipping a long explainer
 * expanded on a phone buries the operational content under a page of prose —
 * so the initial state is decided here rather than guessed in a class name.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : (window.matchMedia?.(DESKTOP).matches ?? true),
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(DESKTOP);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
