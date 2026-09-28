import { describe, expect, it } from "vitest";
import { friendlyFailureReason } from "@/lib/payment-failure";

describe("friendlyFailureReason", () => {
  it.each([
    // Real messages returned by INFI-PAY/Airtel on 2026-09-28:
    ["You have insufficient funds. Please deposit money into your account and try again.", "There wasn't enough money in the mobile money account."],
    ["Wrong PIN entered. Forgot your PIN? To RESET it, dial *211#, select my Account, then MY PIN and Reset PIN/Forgot PIN", "The PIN entered was incorrect."],
    ["expired", "The payment request expired before it was approved."],
    ["Transaction cancelled by user", "The payment was cancelled on the phone."],
  ])("%s", (raw, friendly) => {
    expect(friendlyFailureReason(raw)).toBe(friendly);
  });

  it("unknown or internal reasons are never shown", () => {
    expect(friendlyFailureReason("initiation_rejected:provider_http_401:UnauthorizedException")).toBeNull();
    expect(friendlyFailureReason("ERR_9921 upstream gateway fault")).toBeNull();
    expect(friendlyFailureReason(null)).toBeNull();
  });
});
