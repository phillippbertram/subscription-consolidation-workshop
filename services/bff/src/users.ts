export interface UserIdentity {
  issuer: string;
  subject: string;
}

export interface UserProfile {
  userId: string;
  createdAt: string;
}

export interface UserStore {
  getOrCreate(identity: UserIdentity): Promise<UserProfile>;
}
