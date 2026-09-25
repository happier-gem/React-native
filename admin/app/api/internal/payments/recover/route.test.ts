import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recoverPendingPayments = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payment-recovery", () => ({ recoverPendingPayments }));

import { GET, POST } from "./route";

const call = (handler: typeof GET, auth?: string) =>
  handler(new Request("http://x/api/internal/payments/recover", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  recoverPendingPayments.mockReset().mockResolvedValue({ checked: 0 });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("/api/internal/payments/recover", () => {
  it("is disabled while CRON_SECRET is unset", async () => {
    expect((await call(GET, "Bearer anything")).status).toBe(503);
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong", "wrong-scheme cron-secret", "Bearer "])("rejects %s", async (auth) => {
    process.env.CRON_SECRET = "cron-secret";
    expect((await call(POST, auth)).status).toBe(401);
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it("runs recovery with the right bearer secret (GET for Vercel Cron, POST otherwise)", async () => {
    process.env.CRON_SECRET = "cron-secret";
    expect((await call(GET, "Bearer cron-secret")).status).toBe(200);
    expect((await call(POST, "Bearer cron-secret")).status).toBe(200);
    expect(recoverPendingPayments).toHaveBeenCalledTimes(2);
  });
});
