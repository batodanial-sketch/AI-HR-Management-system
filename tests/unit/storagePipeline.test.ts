/**
 * Phase R3 — file validation + malware-scan fail-closed contract + tenant keys.
 */
import { MAX_UPLOAD_BYTES, keyBelongsToTenant, objectKey, sanitizeFilename, validateFile } from "@/lib/storage/validate";

jest.mock("server-only", () => ({}), { virtual: true });

import { interpretScannerPayload, scanBytes, scannerEnforced, type ScannerConfig } from "@/lib/storage/scanner";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, ...new Array(64).fill(0x20)]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)]);
const docxBytes = () => {
  const head = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00];
  const name = Array.from(Buffer.from("[Content_Types].xml"));
  return new Uint8Array([...head, ...new Array(20).fill(0), ...name, ...new Array(64).fill(0)]);
};
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";

const file = (name: string, mime: string, bytes: Uint8Array, size = bytes.byteLength) => ({ name, declaredMime: mime, size, head: bytes });

describe("file validation", () => {
  test("valid PDF", () => expect(validateFile(file("cv.pdf", "application/pdf", PDF))).toMatchObject({ ok: true, kind: "pdf" }));
  test("valid DOCX", () =>
    expect(validateFile(file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes()))).toMatchObject({ ok: true, kind: "docx" }));
  test("valid PNG / JPEG", () => {
    expect(validateFile(file("id.png", "image/png", PNG))).toMatchObject({ ok: true, kind: "png" });
    expect(validateFile(file("id.jpg", "image/jpeg", JPEG))).toMatchObject({ ok: true, kind: "jpeg" });
  });
  test("oversized file", () => expect(validateFile(file("cv.pdf", "application/pdf", PDF, MAX_UPLOAD_BYTES + 1))).toMatchObject({ ok: false, code: "TOO_LARGE" }));
  test("invalid MIME type", () => expect(validateFile(file("run.exe", "application/x-msdownload", PDF))).toMatchObject({ ok: false }));
  test("extension mismatch", () => expect(validateFile(file("cv.docx", "application/pdf", PDF))).toMatchObject({ ok: false, code: "EXTENSION_MISMATCH" }));
  test("malformed file (magic bytes disagree)", () => expect(validateFile(file("cv.pdf", "application/pdf", PNG))).toMatchObject({ ok: false, code: "MALFORMED_FILE" }));
  test("malformed DOCX (zip without content types)", () =>
    expect(validateFile(file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(80).fill(0)])))).toMatchObject({ ok: false, code: "MALFORMED_FILE" }));
  test("empty file", () => expect(validateFile(file("cv.pdf", "application/pdf", new Uint8Array(), 0))).toMatchObject({ ok: false, code: "EMPTY_FILE" }));
  test("suspicious filename (double extension)", () => expect(validateFile(file("cv.pdf.exe", "application/pdf", PDF))).toMatchObject({ ok: false, code: "SUSPICIOUS_FILENAME" }));
  test("suspicious filename (RTL override)", () => expect(validateFile(file("cv\u202Efdp.pdf", "application/pdf", PDF))).toMatchObject({ ok: false, code: "SUSPICIOUS_FILENAME" }));
  test("path traversal attempt", () => {
    expect(validateFile(file("../../etc/passwd.pdf", "application/pdf", PDF))).toMatchObject({ ok: false, code: "PATH_TRAVERSAL" });
    expect(validateFile(file("a/b.pdf", "application/pdf", PDF))).toMatchObject({ ok: false, code: "PATH_TRAVERSAL" });
    expect(validateFile(file("a\\b.pdf", "application/pdf", PDF))).toMatchObject({ ok: false, code: "PATH_TRAVERSAL" });
  });
  test("missing metadata", () => expect(validateFile({ name: "", declaredMime: "application/pdf", size: 10, head: PDF })).toMatchObject({ ok: false, code: "INVALID_METADATA" }));
  test("sanitizeFilename strips path and odd characters", () => expect(sanitizeFilename("../x/y z$%.pdf")).toBe("y z_.pdf"));
});

describe("object keys", () => {
  test("tenant-prefixed canonical key", () => expect(objectKey(ORG, DOC, "pdf")).toBe(`organization/${ORG}/documents/${DOC}.pdf`));
  test("rejects non-uuid ids and unsafe extensions", () => {
    expect(() => objectKey("../x", DOC, "pdf")).toThrow();
    expect(() => objectKey(ORG, DOC, "pdf/../x")).toThrow();
  });
  test("cross-tenant key is never accepted", () => {
    expect(keyBelongsToTenant(objectKey(ORG, DOC, "pdf"), ORG)).toBe(true);
    expect(keyBelongsToTenant(objectKey(ORG, DOC, "pdf"), OTHER)).toBe(false);
    expect(keyBelongsToTenant(`organization/${ORG}/documents/../../${OTHER}/documents/x.pdf`, ORG)).toBe(false);
  });
});

describe("malware scanner — fail closed", () => {
  const cfg = (over: Partial<ScannerConfig> = {}): ScannerConfig => ({ backend: "webhook", url: "http://scanner.local/scan", timeoutMs: 1000, token: null, ...over });
  const fetcher = (impl: () => Promise<Response>) => jest.fn(impl) as unknown as typeof fetch;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  test("CLEAN → clean", async () => expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => json({ verdict: "clean" })) })).verdict).toBe("clean"));
  test("INFECTED → infected with signature", async () => {
    const r = await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => json({ verdict: "infected", signature: "Eicar-Test-Signature" })) });
    expect(r).toMatchObject({ verdict: "infected", signature: "Eicar-Test-Signature" });
  });
  test("scanner unreachable → unavailable (never clean)", async () =>
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => { throw new TypeError("fetch failed"); }) })).verdict).toBe("unavailable"));
  test("scanner timeout → timeout (never clean)", async () => {
    const err = new Error("timeout");
    err.name = "TimeoutError";
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => { throw err; }) })).verdict).toBe("timeout");
  });
  test("scanner HTTP 500 → unavailable", async () => expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => json({}, 500)) })).verdict).toBe("unavailable"));
  test("non-JSON / unknown payload → error (never clean)", async () => {
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => new Response("<html>", { status: 200 })) })).verdict).toBe("error");
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => json({ verdict: "probably fine" })) })).verdict).toBe("error");
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg(), fetcher: fetcher(async () => json({})) })).verdict).toBe("error");
  });
  test("scanner disabled → unavailable and not enforced", async () => {
    expect((await scanBytes(PDF, "cv.pdf", { config: cfg({ backend: "disabled" }) })).verdict).toBe("unavailable");
    expect(scannerEnforced({ MALWARE_SCANNER: "disabled" } as NodeJS.ProcessEnv)).toBe(false);
    expect(scannerEnforced({ MALWARE_SCANNER: "webhook" } as NodeJS.ProcessEnv)).toBe(false); // no URL
    expect(scannerEnforced({ MALWARE_SCANNER: "clamav-rest", MALWARE_SCANNER_URL: "http://x" } as NodeJS.ProcessEnv)).toBe(true);
  });
  test("clamav-rest payload shapes", () => {
    expect(interpretScannerPayload([{ Status: "OK" }], "clamav-rest").verdict).toBe("clean");
    expect(interpretScannerPayload([{ Status: "FOUND", Description: "Eicar" }], "clamav-rest")).toMatchObject({ verdict: "infected", signature: "Eicar" });
    expect(interpretScannerPayload({ is_infected: true, viruses: ["X"] }, "clamav-rest").verdict).toBe("infected");
    expect(interpretScannerPayload({ is_infected: false }, "clamav-rest").verdict).toBe("clean");
    expect(interpretScannerPayload(null, "clamav-rest").verdict).toBe("error");
  });
  test("bearer token is sent to the scanner, never logged in result", async () => {
    const f = fetcher(async () => json({ verdict: "clean" }));
    const r = await scanBytes(PDF, "cv.pdf", { config: cfg({ token: "scanner-secret" }), fetcher: f });
    const init = (f as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer scanner-secret");
    expect(JSON.stringify(r)).not.toContain("scanner-secret");
  });
});
