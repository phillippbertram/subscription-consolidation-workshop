import type {
  AdminCheck,
  AdminMarker,
  AdminOutboxEntry,
  AdminQueue,
  AdminUser,
} from '@premiumpass/api-contracts/admin';

/** A pending outbox entry or store completion older than this is worth a look. */
const STALE_MS = 60_000;

interface CheckInput {
  users: AdminUser[];
  outbox: AdminOutboxEntry[];
  markers: AdminMarker[];
  queues: AdminQueue[];
  unrecognized: number;
  now: Date;
}

/**
 * Consistency rules over one snapshot of the table and the queues. Pure
 * functions with an injected time: the same input always gives the same
 * result. Each rule mirrors a risk from the code review rules in AGENTS.md.
 * Passing rules are returned too, so the console shows what was checked.
 */
export function runChecks(input: CheckInput): AdminCheck[] {
  return [
    ownerBindings(input),
    snapshotDrift(input),
    outboxWaiting(input),
    storeCompletion(input),
    deadLetters(input),
    workQueueReachable(input),
    recordsValid(input),
    unverifiedSubscriptions(input),
  ];
}

function check(
  id: string,
  failed: boolean,
  severity: Exclude<AdminCheck['severity'], 'ok'>,
  title: string,
  detail: string,
  userIds: string[] = [],
): AdminCheck {
  return {
    id,
    severity: failed ? severity : 'ok',
    title,
    detail,
    userIds: [...new Set(userIds)],
  };
}

/** A purchase assigned to the wrong owner is the most serious data error. */
function ownerBindings({ users }: CheckInput) {
  const affected = users.filter((user) =>
    user.subscriptions.some((subscription) => subscription.ownerMismatch),
  );
  return check(
    'owner_bindings',
    affected.length > 0,
    'critical',
    affected.length
      ? `Owner binding mismatch for ${affected.length} user(s)`
      : 'Owner bindings match',
    affected.length
      ? 'A provider owner record names a different user than the stored subscription. Investigate; there is no automatic repair.'
      : 'Every bound provider subscription is stored under the user it is bound to.',
    affected.map((user) => user.userId),
  );
}

/** The stored snapshot lags behind when an access boundary passed without an event. */
function snapshotDrift({ users }: CheckInput) {
  const affected = users.filter((user) => user.drift);
  return check(
    'snapshot_drift',
    affected.length > 0,
    'warning',
    affected.length
      ? `Snapshot drift for ${affected.length} user(s)`
      : 'Snapshots match current access',
    affected.length
      ? 'The stored ENTITLEMENTS record differs from access computed now. The API already answers correctly; an expiration check refreshes the snapshot and announces the change.'
      : 'Every stored snapshot equals the access computed at this moment.',
    affected.map((user) => user.userId),
  );
}

function outboxWaiting({ outbox, now }: CheckInput) {
  const waiting = outbox.filter(
    (entry) =>
      entry.status === 'pending' &&
      now.getTime() - Date.parse(entry.createdAt) > STALE_MS,
  );
  return check(
    'outbox_waiting',
    waiting.length > 0,
    'warning',
    waiting.length
      ? `${waiting.length} outbox entr${waiting.length === 1 ? 'y' : 'ies'} waiting longer than 60 s`
      : 'No outbox entry is waiting',
    waiting.length
      ? 'The outbox publisher runs separately. Start it with pnpm dev:outbox; access does not wait for it.'
      : 'Pending entries, if any, are younger than 60 seconds.',
    waiting.map((entry) => entry.userId),
  );
}

/** Apple finish and Google acknowledgement run after the commit and may need a retry. */
function storeCompletion({ markers, now }: CheckInput) {
  const pending = markers.filter(
    (marker) =>
      marker.completion === 'pending' &&
      now.getTime() - Date.parse(marker.processedAt) > STALE_MS,
  );
  return check(
    'store_completion',
    pending.length > 0,
    'warning',
    pending.length
      ? `${pending.length} store completion(s) pending`
      : 'Store completions recorded',
    pending.length
      ? 'Committed Apple or Google jobs have no recorded finish or acknowledgement yet. A worker retry resumes that last step.'
      : 'Every Apple finish and Google acknowledgement that was needed is recorded.',
    pending.flatMap((marker) => (marker.userId ? [marker.userId] : [])),
  );
}

function deadLetters({ queues }: CheckInput) {
  const letters = queues
    .filter((queue) => queue.role === 'work_dlq' || queue.role === 'events_dlq')
    .reduce(
      (sum, queue) => sum + queue.visible + queue.inFlight + queue.delayed,
      0,
    );
  return check(
    'dead_letters',
    letters > 0,
    'warning',
    letters
      ? `${letters} dead-lettered message(s)`
      : 'Dead-letter queues empty',
    letters
      ? 'Jobs or events failed five times. Find the cause in the worker or consumer log, then redrive.'
      : 'No job or event has failed five times.',
  );
}

function workQueueReachable({ queues }: CheckInput) {
  const work = queues.find((queue) => queue.role === 'work');
  return check(
    'work_queue',
    !work?.available,
    'warning',
    work?.available ? 'Work queue reachable' : 'Work queue unreachable',
    work?.available
      ? 'ElasticMQ answers at 127.0.0.1:9324.'
      : 'ElasticMQ does not answer. Start it with pnpm local:up; queued actions fail until then.',
  );
}

function recordsValid({ unrecognized }: CheckInput) {
  return check(
    'records_valid',
    unrecognized > 0,
    'warning',
    unrecognized
      ? `${unrecognized} record(s) not recognized`
      : 'All records recognized',
    unrecognized
      ? 'Some items match no known key pattern or fail their schema. They are listed on the processing page.'
      : 'Every item matches a known record type and its schema.',
  );
}

/** Verified processing always writes an owner binding; CLI demo rows do not. */
function unverifiedSubscriptions({ users }: CheckInput) {
  const affected = users.filter((user) =>
    user.subscriptions.some(
      (subscription) =>
        subscription.provider !== 'apple_mock' &&
        !subscription.ownerBound &&
        !subscription.ownerMismatch &&
        !subscription.demoScenario,
    ),
  );
  return check(
    'unverified_subscriptions',
    affected.length > 0,
    'info',
    affected.length
      ? `${affected.length} user(s) with unbound subscriptions`
      : 'Every provider subscription is bound',
    affected.length
      ? 'A provider subscription has no owner binding. Verified processing always writes one; the record probably comes from a local edit.'
      : 'Provider subscriptions carry an owner binding or a demo marker.',
    affected.map((user) => user.userId),
  );
}
