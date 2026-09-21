import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

export type AdminUserStatus = "active" | "banned";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "user";
  status: AdminUserStatus;
  createdAt: number;
  imageUrl: string;
};

export type UserFilters = {
  query?: string;
  status?: AdminUserStatus | "all";
  page?: number;
  pageSize?: number;
};

export type UserListResult =
  | { ok: true; rows: AdminUserRow[]; total: number; pageCount: number }
  | { ok: false; error: string };

const DEFAULT_PAGE_SIZE = 20;

/**
 * Clerk's Backend API can search by name/email/etc. (the `query` param) but
 * has no "banned" filter, so status filtering happens on the fetched page
 * here rather than in the query. For a large user base this means the status
 * filter only applies within the current page of results, not globally.
 */
export async function listUsers(filters: UserFilters): Promise<UserListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  try {
    const clerk = await clerkClient();
    const { data, totalCount } = await clerk.users.getUserList({
      query: filters.query?.trim() || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy: "-created_at",
    });

    let rows: AdminUserRow[] = data.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "(no name)",
      email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null,
      role: u.publicMetadata?.role === "admin" ? "admin" : "user",
      status: u.banned ? "banned" : "active",
      createdAt: u.createdAt,
      imageUrl: u.imageUrl,
    }));

    if (filters.status && filters.status !== "all") {
      rows = rows.filter((r) => r.status === filters.status);
    }

    return { ok: true, rows, total: totalCount, pageCount: Math.max(1, Math.ceil(totalCount / pageSize)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
