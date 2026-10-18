import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function optionalEnvironment(path: URL): NodeJS.ProcessEnv {
  try {
    return parseEnv(readFileSync(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw new Error('Unable to load the local CLI provider environment.', {
      cause: error,
    });
  }
}

/** Load provider settings only when a command needs them; never select storage here. */
export function readCliEnvironment(): NodeJS.ProcessEnv {
  // Source and bundled entries both live one directory below apps/cli. Resolve
  // from the module so commands also work outside the workspace directory.
  // Shell values override this application's settings without mutating process.env.
  return {
    ...optionalEnvironment(new URL('../.env', import.meta.url)),
    ...process.env,
  };
}
