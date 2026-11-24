/** Setlist dates are calendar dates stored at UTC midnight. */
export const toDateInput = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const fromDateInput = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
export const formatDate = (d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) =>
  d ? new Date(d).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" }) : "";
