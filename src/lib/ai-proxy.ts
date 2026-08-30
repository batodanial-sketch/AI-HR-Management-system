export const bridgeUrl = () => {
  return process.env.AI_BRIDGE_URL || "http://localhost:8000";
};

export const bridgeSecret = () => {
  return process.env.AI_BRIDGE_SECRET || "";
};

export const proxyToBridge = async (request: Request, path: string, options: RequestInit = {}) => {
  const url = new URL(path, bridgeUrl());
  const headers = new Headers(options.headers || {});
  headers.set("X-Bridge-Secret", bridgeSecret());
  headers.set("Content-Type", "application/json");

  return fetch(url.toString(), {
    ...options,
    headers,
  });
};