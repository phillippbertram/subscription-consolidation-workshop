export function readLocalConfig(env: NodeJS.ProcessEnv) {
  const rawPort = env.PORT;

  if (rawPort === undefined || rawPort.trim() === '') {
    throw new Error(
      'PORT is required for local startup. Copy services/bff/.env.example to services/bff/.env or set PORT.',
    );
  }

  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  return { port: Number(rawPort), hostname: '127.0.0.1' };
}
