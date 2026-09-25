"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type SVGProps } from "react";
import { UserButton } from "@clerk/nextjs";

function OverviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <path d="M16 4.2c1.6.4 2.75 1.9 2.75 3.55 0 1.7-1.2 3.15-2.85 3.5" />
      <path d="M18 13.7c2.7.6 4.5 3 4.5 5.8" />
    </svg>
  );
}

function SubscriptionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14h5" />
    </svg>
  );
}

function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M19.4 13.6a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19.5a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.1 8.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10.5a1.65 1.65 0 0 0 1-1.51V2.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8.5c.14.6.62 1.08 1.51 1H19.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.01 1.1z" />
    </svg>
  );
}

function PaymentsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.75 9.25c-.5-.9-1.6-1.5-2.75-1.5-1.5 0-2.75.85-2.75 2.1 0 2.9 5.5 1.4 5.5 4.3 0 1.25-1.25 2.1-2.75 2.1-1.2 0-2.3-.6-2.8-1.55" />
      <path d="M12 6.25v1.5M12 16.25v1.5" />
    </svg>
  );
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 6h17M3.5 12h17M3.5 18h17" />
    </svg>
  );
}

const links = [
  { href: "/admin", label: "Overview", Icon: OverviewIcon },
  { href: "/admin/users", label: "Users", Icon: UsersIcon },
  { href: "/admin/subscriptions", label: "Subscriptions", Icon: SubscriptionsIcon },
  { href: "/admin/payments", label: "Payments", Icon: PaymentsIcon },
  { href: "/admin/analytics", label: "Analytics", Icon: AnalyticsIcon },
  { href: "/admin/settings", label: "Settings", Icon: SettingsIcon },
] as const;

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {links.map(({ href, label, Icon }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
              (active
                ? "bg-foreground text-background font-medium"
                : "text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white")
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — the sidebar collapses behind this below the md breakpoint */}
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 md:hidden dark:border-white/15">
        <span className="font-semibold">Subscription Tracker</span>
        <div className="flex items-center gap-3">
          <UserButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="rounded-lg border border-black/15 p-2 dark:border-white/20"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-b border-black/10 py-3 md:hidden dark:border-white/15">
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-black/10 py-5 md:flex dark:border-white/15">
        <div className="mb-6 px-6 text-base font-semibold">Subscription Tracker</div>
        <NavLinks pathname={pathname} />
        <div className="mt-auto flex items-center gap-3 border-t border-black/10 px-6 pt-4 dark:border-white/15">
          <UserButton />
          <span className="text-xs text-black/50 dark:text-white/50">Signed in</span>
        </div>
      </aside>
    </>
  );
}
