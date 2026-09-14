// Every timestamp from the analytics API arrives already converted to SAST
// (see management-backend/analytical_db.py's `_to_sast`), but formatting
// still needs an explicit `timeZone` — without it, `toLocaleDateString`/
// `toLocaleString` render in whatever zone the viewer's own machine is set
// to, silently reinterpreting the SAST instant into a different wall-clock
// time. Africa/Johannesburg is a fixed UTC+2 offset with no DST, so this is
// always "+02:00" in practice.

const SAST_TIME_ZONE = 'Africa/Johannesburg'

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', {
    month: 'short',
    day: 'numeric',
    timeZone: SAST_TIME_ZONE,
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: SAST_TIME_ZONE,
  })
}
