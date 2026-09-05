/**
 * Self-hosted fonts. The site links Google Fonts; we deliberately do not.
 * Three reasons: the CSP uses `font-src 'self'`, a government-sector demo
 * should make no third-party requests, and the meeting room may have no
 * internet.
 */
import '@fontsource-variable/archivo';
import '@fontsource-variable/newsreader';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
