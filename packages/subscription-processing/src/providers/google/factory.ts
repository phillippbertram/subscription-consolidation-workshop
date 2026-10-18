import {
  createGoogleClient,
  readGoogleSettings,
  createGoogleClientFromCredentials,
  type GoogleCredentials,
} from '@premiumpass/google-play';
import { ProcessingError } from '../../processing/contracts.js';
import type { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { readCloudGoogleCredentials } from './credentials.js';
import { GoogleSubscriptionProcessor } from './processor.js';
import { GoogleSubscriptionSource } from './source.js';
import { DynamoDbGoogleStore } from './store.js';

/** Keep lazy Google client reuse scoped to one worker runtime. */
export function createGoogleProcessorFactory(
  store: DynamoDbProcessingStore,
  env: NodeJS.ProcessEnv,
  local: boolean,
) {
  let source: GoogleSubscriptionSource | undefined;
  let sourceCredentials: GoogleCredentials | undefined;
  return async function createGoogleProcessor() {
    const settings = readGoogleSettings(env);
    if (!settings) {
      throw new ProcessingError('google_not_configured');
    }

    if (local) {
      source ??= new GoogleSubscriptionSource(
        settings,
        createGoogleClient(settings, env),
      );
    } else {
      const credentials = await readCloudGoogleCredentials(env);
      // A long-lived source must not keep a key beyond the credential cache TTL.
      if (!source || sourceCredentials !== credentials) {
        source = new GoogleSubscriptionSource(
          settings,
          createGoogleClientFromCredentials(settings, credentials),
        );
        sourceCredentials = credentials;
      }
    }

    return new GoogleSubscriptionProcessor(
      new DynamoDbGoogleStore(store),
      source,
    );
  };
}
