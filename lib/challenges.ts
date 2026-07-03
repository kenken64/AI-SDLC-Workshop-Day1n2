// In-memory challenge store (per-process; acceptable for single-instance dev)
export const registrationChallenges = new Map<string, string>();
export const loginChallenges = new Map<string, string>();
