import { pickFields, pickTimes } from '@premiumpass/logging';

/**
 * A safe view of a verified Apple notification and the transaction inside it.
 *
 * Apple delivers two nested signed JWS strings (`signedTransactionInfo`,
 * `signedRenewalInfo`). They are never logged. This reads only named plain
 * fields from the already decoded objects: the notification type and subtype
 * explain why Apple called, and the transaction's product and dates show what it
 * is about. `appAccountToken` is our own internal user ID, which links the log
 * to the owner without exposing anything Apple-specific.
 */
export function summarizeAppleNotification(
  notification: { data?: unknown },
  transaction?: unknown,
) {
  return {
    notification: {
      ...pickFields(notification, [
        'notificationType',
        'subtype',
        'notificationUUID',
        'version',
      ]),
      ...pickTimes(notification, ['signedDate'], 'milliseconds'),
      ...pickFields(notification.data, ['environment', 'bundleId', 'status']),
    },
    transaction:
      transaction === undefined
        ? undefined
        : {
            ...pickFields(transaction, [
              'transactionId',
              'originalTransactionId',
              'productId',
              'type',
              'environment',
              'offerType',
              'revocationReason',
              'inAppOwnershipType',
              'appAccountToken',
            ]),
            ...pickTimes(
              transaction,
              [
                'purchaseDate',
                'originalPurchaseDate',
                'expiresDate',
                'revocationDate',
              ],
              'milliseconds',
            ),
          },
  };
}
