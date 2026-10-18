import {
  ScanCommand,
  type DynamoDBDocumentClient,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

/** Small-demo discovery: filters reduce returned data, not evaluated capacity or IAM access. */
export async function* scanReferences(
  client: DynamoDBDocumentClient,
  input: Omit<ScanCommandInput, 'ExclusiveStartKey'>,
  checkTime: () => void,
) {
  let cursor: ScanCommandInput['ExclusiveStartKey'];
  do {
    checkTime();
    const page = await client.send(
      new ScanCommand({
        ...input,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const item of page.Items ?? []) {
      checkTime();
      yield item;
    }

    // An empty filtered page may still have more evaluated pages behind it.
    cursor = page.LastEvaluatedKey;
  } while (cursor);
}
