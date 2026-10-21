/** Local date and time with seconds; ordering of events often needs them. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '–';
  }

  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-GB');
}

/** "3 min 12 s" between two instants; used for waiting times. */
export function formatAge(from: string, to: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.parse(to) - Date.parse(from)) / 1000),
  );
  if (seconds < 60) {
    return `${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ${seconds % 60} s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours} h ${minutes % 60} min`;
  }

  return `${Math.floor(hours / 24)} days`;
}

/** First UUID block: enough to tell demo users apart in tables. */
export function shortId(value: string) {
  return value.slice(0, 8);
}
