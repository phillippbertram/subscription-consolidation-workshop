import { z } from 'zod';

// One complimentary Premium grant per user is enough for this demo. Keeping it
// outside SUB records prevents provider refreshes and demo edits from replacing it.
export const adminGrantSchema = z.object({
  userId: z.uuid(),
  grantId: z.literal('premium'),
  state: z.enum(['active', 'revoked']),
  expiresAt: z.iso.datetime().nullable(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AdminGrant = z.infer<typeof adminGrantSchema>;

export function hasAdminAccess(grant: AdminGrant, now: Date) {
  return (
    grant.state === 'active' &&
    (grant.expiresAt === null || Date.parse(grant.expiresAt) > now.getTime())
  );
}
