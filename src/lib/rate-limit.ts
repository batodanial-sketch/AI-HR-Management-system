// Simple stub for rate limiting – no external dependencies
export const apiRatelimit = {
  // Mimic the `limit` method signature used in the codebase
  async limit(key: string) {
    // Always allow – returns an object with `success: true`
    return { success: true, remaining: Number.MAX_SAFE_INTEGER, reset: Date.now() + 1000 };
  },
};