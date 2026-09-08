/**
 * Phase XI (ultimate audit) — inbound integration body-size guard.
 *
 * Middleware rejects webhook/desktop/SCIM requests that advertise an
 * oversized content-length before their raw bodies are buffered for
 * signature verification.
 */

import {
  advertisesBodyOverLimit,
  INTEGRATION_BODY_LIMIT_BYTES,
} from "@/lib/http-limit";

function headersOf(record: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(record)) h.set(k, v);
  return h;
}

describe("advertisesBodyOverLimit", () => {
  it("rejects an advertised length above the cap", () => {
    expect(
      advertisesBodyOverLimit(
        headersOf({ "content-length": String(INTEGRATION_BODY_LIMIT_BYTES + 1) }),
        INTEGRATION_BODY_LIMIT_BYTES,
      ),
    ).toBe(true);
  });

  it("accepts lengths at or under the cap", () => {
    const h = headersOf({
      "content-length": String(INTEGRATION_BODY_LIMIT_BYTES),
    });
    expect(advertisesBodyOverLimit(h, INTEGRATION_BODY_LIMIT_BYTES)).toBe(false);
    expect(
      advertisesBodyOverLimit(headersOf({ "content-length": "1024" }), INTEGRATION_BODY_LIMIT_BYTES),
    ).toBe(false);
  });

  it("accepts missing and malformed content-length (streamed bodies)", () => {
    expect(advertisesBodyOverLimit(new Headers(), INTEGRATION_BODY_LIMIT_BYTES)).toBe(false);
    expect(
      advertisesBodyOverLimit(headersOf({ "content-length": "not-a-number" }), INTEGRATION_BODY_LIMIT_BYTES),
    ).toBe(false);
    expect(
      advertisesBodyOverLimit(headersOf({ "transfer-encoding": "chunked" }), INTEGRATION_BODY_LIMIT_BYTES),
    ).toBe(false);
  });

  it("accepts a plain Headers instance and a plain object interchangeably", () => {
    const over = String(INTEGRATION_BODY_LIMIT_BYTES + 1);
    expect(advertisesBodyOverLimit(new Headers({ "content-length": over }), INTEGRATION_BODY_LIMIT_BYTES)).toBe(true);
    expect(advertisesBodyOverLimit({ "content-length": over }, INTEGRATION_BODY_LIMIT_BYTES)).toBe(true);
    expect(advertisesBodyOverLimit({ "content-length": "100" }, INTEGRATION_BODY_LIMIT_BYTES)).toBe(false);
  });
});
