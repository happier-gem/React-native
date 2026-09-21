import Image from "next/image";
import { cookies } from "next/headers";
import { currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import { requireAdmin } from "@/lib/admin-auth";
import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";
import { setThemeAction } from "./actions";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [user, store] = await Promise.all([currentUser(), cookies()]);
  const currentTheme = (store.get(THEME_COOKIE)?.value as ThemePreference | undefined) ?? "system";

  const email = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? null;

  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">Admin profile</h2>
        {user ? (
          <div className="mt-3 flex items-center gap-4">
            <Image src={user.imageUrl} alt="" width={48} height={48} className="rounded-full" unoptimized />
            <div>
              <p className="font-medium">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Admin"}</p>
              <p className="text-sm text-black/60 dark:text-white/60">{email ?? "no email on file"}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-black/60 dark:text-white/60">Not signed in.</p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">Theme</h2>
        <div className="mt-3 flex gap-2">
          {THEME_OPTIONS.map((option) => (
            <form key={option.value} action={setThemeAction}>
              <input type="hidden" name="theme" value={option.value} />
              <button
                type="submit"
                className={
                  option.value === currentTheme
                    ? "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
                    : "rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                }
              >
                {option.label}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">Notification preferences</h2>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          No email or push delivery is wired up for the admin site yet, so there&apos;s nothing here to toggle
          honestly. This section will hold real preferences once an outbound notification channel exists.
        </p>
      </section>

      <section className="mt-6">
        <SignOutButton>
          <button className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
            Sign out
          </button>
        </SignOutButton>
      </section>
    </>
  );
}
