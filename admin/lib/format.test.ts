import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/format";

describe("admin dates are Malawi time (CAT, UTC+2)", () => {
  it("shows the Malawi clock time, not UTC", () => {
    expect(formatDateTime("2026-09-28T09:12:45Z")).toBe("Sep 28, 2026, 11:12 CAT");
  });

  it("rolls the date over at Malawi midnight, not UTC midnight", () => {
    // 23:30 UTC on the 28th is already 01:30 on the 29th in Malawi.
    expect(formatDate("2026-09-28T23:30:00Z")).toBe("Sep 29, 2026");
    expect(formatDateTime("2026-09-28T23:30:00Z")).toBe("Sep 29, 2026, 01:30 CAT");
  });

  it("handles missing and invalid values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
  });
});
