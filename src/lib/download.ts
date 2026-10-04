/**
 * How long the object URL outlives the click. Revoking straight away can
 * cancel a large download in some browsers before it has read the blob; ten
 * seconds is ample and still frees the memory.
 */
const REVOKE_AFTER_MS = 10_000;

/** Hand a fetched file to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
