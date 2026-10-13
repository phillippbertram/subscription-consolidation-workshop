/**
 * Verified issuer/subject pair used to resolve an internal user. Callers must
 * authenticate first; subjects are unique only within their issuing authority.
 */
export interface UserIdentity {
  issuer: string;
  subject: string;
}

/** Minimal persisted account returned by the API, without provider claims. */
export interface UserProfile {
  /** Stable internal UUID shared by profiles, purchases and subscriptions. */
  userId: string;
  /** UTC ISO timestamp assigned once when the profile is created. */
  createdAt: string;
}

/** Profile persistence boundary independent of HTTP and the storage SDK. */
export interface UserStore {
  /**
   * Resolve the verified identity or atomically create its mapping and profile.
   * Concurrent first requests converge on one user; inconsistent records or
   * storage failures throw instead of creating a replacement identity.
   */
  getOrCreate(identity: UserIdentity): Promise<UserProfile>;
}
