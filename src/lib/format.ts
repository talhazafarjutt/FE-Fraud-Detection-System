const ABSOLUTE = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${ABSOLUTE.format(date)} UTC`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = (date.getTime() - Date.now()) / 1000;
  const magnitude = Math.abs(seconds);
  if (magnitude < 45) return 'just now';
  for (const [unit, secondsPerUnit] of UNITS) {
    if (magnitude >= secondsPerUnit) {
      return RELATIVE.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return 'just now';
}

/** Short form of a UUID for dense table cells; full value stays in a title. */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}
