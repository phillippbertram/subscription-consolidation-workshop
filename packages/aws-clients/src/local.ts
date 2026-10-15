export const LOCAL_DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000';
export const LOCAL_SQS_ENDPOINT = 'http://127.0.0.1:9324';

/** Explicit local endpoints always use dummy credentials, never an AWS profile. */
export function localClientConfig(endpoint: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    endpoint !== url.origin
  ) {
    throw new Error('Local AWS clients require a loopback HTTP origin.');
  }

  return {
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  };
}
