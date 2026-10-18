import { ProcessingError } from '../../processing/contracts.js';
import type { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { GoogleMockProcessor } from './processor.js';
import { GoogleMockSource } from './source.js';
import { DynamoDbGoogleMockStore } from './store.js';

export function createGoogleMockProcessor(
  store: DynamoDbProcessingStore,
  local: boolean,
) {
  if (!local) {
    throw new ProcessingError('local_job_rejected');
  }

  return new GoogleMockProcessor(
    new DynamoDbGoogleMockStore(store),
    new GoogleMockSource(store.client, store.tableName),
  );
}
