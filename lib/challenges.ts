// In-memory challenge store for WebAuthn flows.
// Acceptable for single-instance dev; replace with Redis for multi-instance prod.

export const registrationChallenges = new Map<string, string>();
export const loginChallenges = new Map<string, string>();
