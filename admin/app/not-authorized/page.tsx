import { SignOutButton } from "@clerk/nextjs";

export default function NotAuthorizedPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-black/10 p-8 text-center dark:border-white/15">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Your account doesn&apos;t have admin access. If you should have it, ask an
          existing admin to set your role.
        </p>
        <SignOutButton>
          <button className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
