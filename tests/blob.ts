/**
 * Read a Blob's text, whichever `Blob` it turns out to be.
 *
 * WHY THIS EXISTS
 * Under jsdom there are two `Blob` classes in the process: jsdom's, which is
 * what the global `Blob` and `FileReader` are, and Node's own, which undici's
 * `Response.blob()` may return instead. Which one a test gets depends on the
 * Node version, not on anything in this codebase:
 *
 *   Node 24  `Response.blob()` builds from the global, so it returns jsdom's
 *            Blob. `instanceof Blob` holds; FileReader accepts it; it has no
 *            `.text()`.
 *   Node 22  undici uses its internal Blob. `instanceof Blob` is FALSE against
 *            jsdom's global, and jsdom's FileReader rejects it with "parameter
 *            1 is not of type 'Blob'". It does have `.text()`.
 *
 * So a test that used FileReader, or asserted `toBeInstanceOf(Blob)`, passed on
 * a Node 24 laptop and failed on the Node 22 CI runner — the same code, the
 * same bytes. Both runtimes are supported by `engines`, so the tests must hold
 * on both.
 *
 * Production is unaffected: a browser has exactly one realm, so `fetch`,
 * `Response` and `Blob` always agree there.
 *
 * Assert on what came back, not on which constructor made it. The contract
 * under test is "the server's bytes reach the caller", and the bytes are
 * identical either way.
 */
export function blobText(blob: Blob): Promise<string> {
  // Node's native Blob (Node 22 under jsdom) — and any modern Blob.
  if (typeof blob.text === 'function') return blob.text();

  // jsdom's Blob, which implements FileReader input but not `.text()`.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(blob);
  });
}

/**
 * Blob-shaped, from either realm. A structural check, because `instanceof Blob`
 * answers a question about the test runtime rather than about the code.
 */
export function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Blob).size === 'number' &&
    typeof (value as Blob).type === 'string' &&
    Object.prototype.toString.call(value) === '[object Blob]'
  );
}
