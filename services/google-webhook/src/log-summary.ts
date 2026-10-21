import { pickTimes } from '@premiumpass/logging';

// RTDN sends the type as a number. The names come from Google's reference:
// https://developer.android.com/google/play/billing/rtdn-reference
const subscriptionNotificationNames: Record<number, string> = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
  17: 'SUBSCRIPTION_ITEMS_CHANGED',
  18: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
  19: 'SUBSCRIPTION_PRICE_CHANGE_UPDATED',
  20: 'SUBSCRIPTION_PENDING_PURCHASE_CANCELED',
  22: 'SUBSCRIPTION_PRICE_STEP_UP_CONSENT_UPDATED',
};

interface GoogleNotificationFields {
  packageName: string;
  eventTimeMillis?: string | number | undefined;
  subscriptionNotification?: { notificationType: number } | undefined;
  voidedPurchaseNotification?: { productType: number } | undefined;
  testNotification?: object | undefined;
  oneTimeProductNotification?: object | undefined;
}

/**
 * A safe view of one verified Real-time developer notification.
 *
 * The notification carries a bearer purchase token, which is never logged.
 * `providerSubscriptionId` is the digest that also names the subscription in
 * the database and in the worker's logs (see googleSubscriptionId), so a log
 * line here can be followed to the record without exposing the token.
 */
export function summarizeGoogleNotification(
  notification: GoogleNotificationFields,
  pubsub: { messageId: string; subscription: string },
  providerSubscriptionId?: string,
) {
  const type = notification.subscriptionNotification?.notificationType;
  // Google sends epoch milliseconds; the log shows a readable ISO time.
  const eventTime = pickTimes(
    notification,
    ['eventTimeMillis'],
    'milliseconds',
  ).eventTimeMillis;

  return {
    kind: notificationKind(notification),
    packageName: notification.packageName,
    ...(eventTime ? { eventTime } : {}),
    ...(type === undefined
      ? {}
      : {
          notificationType: type,
          notificationName: subscriptionNotificationNames[type] ?? 'UNKNOWN',
        }),
    ...(notification.voidedPurchaseNotification
      ? {
          voidedProductType:
            notification.voidedPurchaseNotification.productType,
        }
      : {}),
    ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
    pubsubMessageId: pubsub.messageId,
    pubsubSubscription: pubsub.subscription,
  };
}

function notificationKind(notification: GoogleNotificationFields) {
  if (notification.subscriptionNotification) {
    return 'subscription';
  }

  if (notification.voidedPurchaseNotification) {
    return 'voided_purchase';
  }

  if (notification.testNotification) {
    return 'test';
  }

  return 'one_time_product';
}
