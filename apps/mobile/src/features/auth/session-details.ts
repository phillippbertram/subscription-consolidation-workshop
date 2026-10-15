import { jwtDecode } from 'jwt-decode';

// Inspection only: these decoded values never authorize API or Premium access.
export function inspectJwt(token: string) {
  try {
    if (token.split('.').length !== 3) {
      return null;
    }

    return {
      header: jwtDecode<unknown>(token, { header: true }),
      claims: jwtDecode<unknown>(token),
    };
  } catch {
    return null;
  }
}

export function formatSessionTime(seconds: number | undefined) {
  if (seconds === undefined) {
    return 'Not provided';
  }

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toISOString();
}
