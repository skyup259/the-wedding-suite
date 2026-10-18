import { DateTime } from 'luxon';
import type { EventInput } from '@wedding-suite/shared/website';
export function localInstant(value: string, zone: string) {
  const date = DateTime.fromISO(value, { zone });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value)
    throw new Error(
      'This local time does not exist in the wedding timezone. Choose another time.',
    );
  if (date.getPossibleOffsets().length > 1)
    throw new Error(
      'This local time occurs twice. Choose an unambiguous time or update the wedding timezone.',
    );
  return date.toUTC().toISO()!;
}
export const localTime = (instant: string | undefined, zone: string) =>
  instant
    ? DateTime.fromISO(instant).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm")
    : '';
export function statusLabel(status: EventInput['status']) {
  return {
    not_started: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed',
  }[status];
}
