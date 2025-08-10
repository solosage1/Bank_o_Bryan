export type TimezoneOption = { value: string; label: string };

// Common US time zones supported in the app. Extend as needed.
export const TIMEZONES: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];

export function getBrowserTimeZone(): string | null {
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat !== 'undefined') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      // ignore
    }
  }
  return null;
}

export function getTimezoneLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const found = TIMEZONES.find((t) => t.value === value);
  if (found) return found.label;
  // Fallback: try to convert e.g. America/Chicago -> Chicago
  try {
    const city = value.split('/').pop() || value;
    return city.replaceAll('_', ' ');
  } catch {
    return value;
  }
}


