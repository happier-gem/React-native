import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { infiPayProvider } from "@/lib/infi-pay";

// Pins the adapter to INFI-PAY's documented contract (base URL, x-api-key,
// envelope, collections, transaction-status, X-Signature webhooks) plus our
// safety rules (fail closed, never guess a status, uncertain vs rejected).

const ENV = {
  INFI_PAY_API_URL: "https://api.infi-pay.com/api/v1",
  INFI_PAY_API_KEY: "sk_test_super_secret",
  INFI_PAY_WEBHOOK_SECRET: "whsec_test",
  INFI_PAY_ENVIRONMENT: "sandbox",
};
const PARAMS = { amount: 5000, currency: "MWK", phoneNumber: "0991234567", network: "airtel_money" as const, reference: "7f3c9a2e-pay" };
const fetchMock = vi.fn();
const logged: string[] = [];

beforeEach(() => {
  Object.assign(process.env, ENV);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  logged.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
});
afterEach(() => {
  for (const key of [...Object.keys(ENV), "INFI_PAY_TIMEOUT_MS"]) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const respond = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const ok = (data: unknown) => respond(200, { success: true, data, meta: { requestId: "r1" } });
const fail = (status: number, code: string) => respond(status, { success: false, error: { code, message: "m", details: {} } });

describe("configuration", () => {
  it("is configured only when every variable is present and valid", () => {
    expect(infiPayProvider.config()).toEqual({ configured: true, environment: "sandbox" });
  });

  it("reports missing variables by name, never by value", () => {
    delete process.env.INFI_PAY_API_KEY;
    delete process.env.INFI_PAY_ENVIRONMENT;
    const config = infiPayProvider.config();
    expect(config).toEqual({ configured: false, missing: ["INFI_PAY_API_KEY", "INFI_PAY_ENVIRONMENT"], invalid: [] });
    expect(JSON.stringify(config)).not.toContain("whsec_test");
  });

  it("rejects a non-https URL and an unknown environment", () => {
    process.env.INFI_PAY_API_URL = "http://insecure.test";
    process.env.INFI_PAY_ENVIRONMENT = "staging";
    const config = infiPayProvider.config();
    expect(!config.configured && config.invalid.length).toBe(2);
  });

  it("refuses a live key in a sandbox environment", () => {
    process.env.INFI_PAY_API_KEY = "sk_live_51H8x";
    const config = infiPayProvider.config();
    expect(config.configured).toBe(false);
    expect(!config.configured && config.invalid[0]).toMatch(/live key is not allowed/);
    expect(JSON.stringify(config)).not.toContain("sk_live_51H8x");
  });

  it("unconfigured initiation sends nothing and is a definite rejection", async () => {
    delete process.env.INFI_PAY_API_URL;
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "rejected", reason: "provider_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("phone numbers (documented prefixes)", () => {
  it.each([
    ["0991234567", "airtel_money", "0991234567"],
    ["0981234567", "airtel_money", "0981234567"],
    ["+265991234567", "airtel_money", "0991234567"],
    ["265 88 123 4567", "tnm_mpamba", "0881234567"],
    ["0891234567", "tnm_mpamba", "0891234567"],
  ] as const)("%s on %s -> %s", (input, network, normalized) => {
    expect(infiPayProvider.checkPhoneNumber(input, network)).toEqual({ ok: true, normalized });
  });

  it.each([
    ["0881234567", "airtel_money", /isn't on Airtel Money/],
    ["0991234567", "tnm_mpamba", /isn't on TNM Mpamba/],
    ["12345", "airtel_money", /valid Malawi/],
  ] as const)("%s on %s is refused", (input, network, message) => {
    const result = infiPayProvider.checkPhoneNumber(input, network);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(message);
  });
});

describe("initiateCollection", () => {
  it("POSTs the documented request with the x-api-key header", async () => {
    fetchMock.mockResolvedValue(ok({ reference: PARAMS.reference, provider: "airtel", status: "pending" }));
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "accepted", providerReference: PARAMS.reference });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.infi-pay.com/api/v1/payments/collections");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "x-api-key": "sk_test_super_secret", "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      provider: "airtel",
      phoneNumber: "0991234567",
      amount: 5000,
      currency: "MWK",
      reference: PARAMS.reference,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps tnm_mpamba to \"mpamba\"", async () => {
    fetchMock.mockResolvedValue(ok({ reference: PARAMS.reference }));
    await infiPayProvider.initiateCollection({ ...PARAMS, network: "tnm_mpamba", phoneNumber: "0881234567" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toBe("mpamba");
  });

  it.each([
    [400, "BadRequestException"],
    [401, "UnauthorizedException"],
    [429, "ThrottlerException"],
  ])("%i is a definite rejection (nothing created)", async (status, code) => {
    fetchMock.mockResolvedValue(fail(status, code));
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "rejected", reason: `provider_http_${status}:${code}` });
  });

  it("a 2xx with success:false is a rejection", async () => {
    fetchMock.mockResolvedValue(respond(200, { success: false, error: { code: "X" } }));
    expect((await infiPayProvider.initiateCollection(PARAMS)).kind).toBe("rejected");
  });

  it.each([
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
    ["a timeout", () => fetchMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }))],
    ["a 5xx", () => fetchMock.mockResolvedValue(fail(503, "ServiceUnavailable"))],
    ["a 408", () => fetchMock.mockResolvedValue(fail(408, "RequestTimeout"))],
    ["a 2xx that doesn't echo our reference", () => fetchMock.mockResolvedValue(ok({ reference: "someone-else" }))],
    ["a 2xx that isn't JSON", () => fetchMock.mockResolvedValue(respond(200, "<html>"))],
  ])("%s is uncertain — the collection may exist", async (_label, arrange) => {
    arrange();
    expect((await infiPayProvider.initiateCollection(PARAMS)).kind).toBe("uncertain");
  });

  it("never logs the API key or the phone number", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(fail(500, "X")).mockResolvedValueOnce(fail(400, "Y"));
    for (let i = 0; i < 3; i++) await infiPayProvider.initiateCollection(PARAMS);
    expect(logged.join("\n")).not.toContain("sk_test_super_secret");
    expect(logged.join("\n")).not.toContain("0991234567");
  });
});

describe("getTransactionStatus", () => {
  const txn = (status: string, extra: object = {}) =>
    ok({ reference: PARAMS.reference, type: "collection", status, amount: 5000, currency: "MWK", ...extra });

  it("GETs the documented endpoint with x-api-key", async () => {
    fetchMock.mockResolvedValue(txn("pending"));
    await infiPayProvider.getTransactionStatus("ref/with space");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.infi-pay.com/api/v1/payments/transaction-status/ref%2Fwith%20space");
    expect(init.headers).toEqual({ "x-api-key": "sk_test_super_secret" });
  });

  it.each([
    ["pending", "PENDING", undefined],
    ["processing", "PENDING", undefined],
    ["success", "SUCCESS", undefined],
    ["completed", "SUCCESS", undefined],
    ["failed", "FAILED", undefined],
    ["expired", "FAILED", "expired"],
    ["cancelled", "CANCELLED", undefined],
  ])("maps %s -> %s", async (raw, expected, reason) => {
    fetchMock.mockResolvedValue(txn(raw));
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toEqual({
      kind: "status",
      status: expected,
      failureReason: reason,
      amount: 5000,
      currency: "MWK",
    });
  });

  it("'refunded' and unrecognized statuses are unknown — never guessed", async () => {
    fetchMock.mockResolvedValueOnce(txn("refunded")).mockResolvedValueOnce(txn("reversed"));
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toEqual({ kind: "unknown_status", rawStatus: "refunded" });
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toEqual({ kind: "unknown_status", rawStatus: "reversed" });
  });

  it("a transaction that isn't a collection is never treated as our payment", async () => {
    fetchMock.mockResolvedValue(txn("success", { type: "payout" }));
    expect((await infiPayProvider.getTransactionStatus("ref-1")).kind).toBe("unknown_status");
  });

  it("an unknown reference (404) is flagged, not failed", async () => {
    fetchMock.mockResolvedValue(fail(404, "NotFoundException"));
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toEqual({ kind: "unknown_status", rawStatus: "not_found" });
  });

  it("errors, 429 and 5xx are 'unavailable'", async () => {
    fetchMock.mockResolvedValueOnce(fail(502, "x")).mockResolvedValueOnce(fail(429, "x")).mockRejectedValueOnce(new TypeError("fetch failed"));
    for (let i = 0; i < 3; i++) expect((await infiPayProvider.getTransactionStatus("ref-1")).kind).toBe("unavailable");
  });
});

describe("parseWebhook (documented X-Signature + payload)", () => {
  const sign = (body: string) => createHmac("sha256", "whsec_test").update(body).digest("hex");
  const parse = (body: string, signature: string | null = sign(body)) =>
    infiPayProvider.parseWebhook(body, new Headers(signature === null ? {} : { "X-Signature": signature }));
  const event = (name: string, data: object = {}) =>
    JSON.stringify({ event: name, data: { transactionId: "b6b6c6d0", amount: 5000, currency: "MWK", status: "SUCCESS", provider: "airtel", externalRef: "AIRTEL_1", ...data } });

  it("the documented payload verifies and becomes a payment event", () => {
    expect(parse(event("payment.success"))).toEqual({
      kind: "payment_event",
      reference: null, // not in the documented payload
      providerTransactionId: "b6b6c6d0",
      reportedStatus: "SUCCESS",
    });
  });

  it("uses our reference if INFI-PAY includes it", () => {
    expect(parse(event("payment.failed", { reference: "7f3c9a2e-pay" }))).toMatchObject({ reference: "7f3c9a2e-pay", reportedStatus: "FAILED" });
  });

  it("an uppercase hex signature is accepted", () => {
    const body = event("payment.success");
    expect(parse(body, sign(body).toUpperCase()).kind).toBe("payment_event");
  });

  it.each([
    ["missing", null],
    ["forged", "0".repeat(64)],
  ])("a %s signature is invalid", (_label, signature) => {
    expect(parse(event("payment.success"), signature)).toEqual({ kind: "invalid_signature" });
  });

  it.each(["payout.success", "refund.failed", "payment.chargeback"])("%s is ignored", (name) => {
    expect(parse(event(name)).kind).toBe("ignored");
  });

  it.each([
    ["not JSON", "nope"],
    ["missing data", JSON.stringify({ event: "payment.success" })],
    ["missing event", JSON.stringify({ data: {} })],
  ])("%s is malformed", (_label, body) => {
    expect(parse(body).kind).toBe("malformed");
  });
});
