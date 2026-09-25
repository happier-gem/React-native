import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { infiPayProvider } from "@/lib/infi-pay";

// These pin the adapter's *safety* behavior (fail closed, never guess a
// status, uncertain vs rejected), not INFI-PAY's real contract — the
// endpoint/field names are still placeholders (see the file header).

const ENV = {
  INFI_PAY_API_URL: "https://sandbox.example.test",
  INFI_PAY_API_KEY: "sk_test_super_secret",
  INFI_PAY_WEBHOOK_SECRET: "whsec_test",
  INFI_PAY_ENVIRONMENT: "sandbox",
};
const PARAMS = { amount: 5000, currency: "MWK", phoneNumber: "0991234567", network: "airtel_money" as const, reference: "int-1" };
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
    expect(config.configured).toBe(false);
    expect(!config.configured && config.invalid.length).toBe(2);
  });

  it("unconfigured initiation sends nothing and is a definite rejection", async () => {
    delete process.env.INFI_PAY_API_URL;
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "rejected", reason: "provider_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("initiateCollection outcomes", () => {
  it("2xx with a reference is accepted", async () => {
    fetchMock.mockResolvedValue(respond(200, { reference: "ref-9" }));
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "accepted", providerReference: "ref-9" });
  });

  it("4xx is a definite rejection", async () => {
    fetchMock.mockResolvedValue(respond(422, { error: "bad phone" }));
    expect(await infiPayProvider.initiateCollection(PARAMS)).toEqual({ kind: "rejected", reason: "provider_http_422" });
  });

  it.each([
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
    ["a timeout", () => fetchMock.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }))],
    ["a 5xx", () => fetchMock.mockResolvedValue(respond(503, "upstream down"))],
    ["a 2xx without a reference", () => fetchMock.mockResolvedValue(respond(200, { ok: true }))],
    ["a 2xx that isn't JSON", () => fetchMock.mockResolvedValue(respond(200, "<html>"))],
  ])("%s is uncertain — the collection may exist", async (_label, arrange) => {
    arrange();
    expect((await infiPayProvider.initiateCollection(PARAMS)).kind).toBe("uncertain");
  });

  it("never logs the API key or the phone number", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await infiPayProvider.initiateCollection(PARAMS);
    fetchMock.mockResolvedValue(respond(500, "x"));
    await infiPayProvider.initiateCollection(PARAMS);
    expect(logged.join("\n")).not.toContain("sk_test_super_secret");
    expect(logged.join("\n")).not.toContain("0991234567");
  });

  it("sends an explicit timeout signal", async () => {
    fetchMock.mockResolvedValue(respond(200, { reference: "r" }));
    await infiPayProvider.initiateCollection(PARAMS);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("getTransactionStatus", () => {
  it.each([
    ["successful", "SUCCESS"],
    ["failed", "FAILED"],
    ["cancelled", "CANCELLED"],
    ["pending", "PENDING"],
  ])("maps %s -> %s", async (raw, expected) => {
    fetchMock.mockResolvedValue(respond(200, { status: raw }));
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toMatchObject({ kind: "status", status: expected });
  });

  it("an unrecognized status is reported as unknown, not guessed", async () => {
    fetchMock.mockResolvedValue(respond(200, { status: "reversed" }));
    expect(await infiPayProvider.getTransactionStatus("ref-1")).toEqual({ kind: "unknown_status", rawStatus: "reversed" });
  });

  it("errors and non-2xx are 'unavailable'", async () => {
    fetchMock.mockResolvedValueOnce(respond(502, "x")).mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await infiPayProvider.getTransactionStatus("ref-1")).kind).toBe("unavailable");
    expect((await infiPayProvider.getTransactionStatus("ref-1")).kind).toBe("unavailable");
  });
});
