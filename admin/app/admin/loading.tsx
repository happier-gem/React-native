// Automatically shown by Next.js while an app/admin/** page's async Server
// Component is fetching (Clerk/Supabase calls) during navigation.
export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-black/10 dark:bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-black/10 dark:border-white/15" />
        ))}
      </div>
    </div>
  );
}
