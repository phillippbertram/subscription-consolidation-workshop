import {
  readAppleSettings,
  readLocalAppleCredentials,
} from '@premiumpass/apple-store';
import { ProcessingError } from '../../processing/contracts.js';
import type { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { readCloudAppleCredentials } from './credentials.js';
import { AppleSubscriptionProcessor } from './processor.js';
import { createAppleSource } from './source.js';
import { DynamoDbAppleStore } from './store.js';

/** Resolve local or cached cloud credentials for the selected Apple job. */
export async function createAppleProcessor(
  store: DynamoDbProcessingStore,
  env: NodeJS.ProcessEnv,
  local: boolean,
) {
  const settings = readAppleSettings(env);
  if (!settings) {
    throw new ProcessingError('apple_not_configured');
  }

  const credentials = local
    ? readLocalAppleCredentials(env)
    : await readCloudAppleCredentials(env);
  return new AppleSubscriptionProcessor(
    new DynamoDbAppleStore(store),
    createAppleSource(settings, credentials),
  );
}
