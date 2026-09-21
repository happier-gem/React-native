import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Subscription Tracker Admin",
  description: "Administration for the Subscription Tracker app",
};

// Runs before paint, only for the "system" preference (light/dark are already
// decided server-side below). Keeps the class in sync with the OS without a
// flash of the wrong theme.
const SYSTEM_THEME_SCRIPT = `
(function () {
  try {
    if (document.documentElement.dataset.theme !== "system") return;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const theme = store.get(THEME_COOKIE)?.value ?? "system";
  const isDarkClass = theme === "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${isDarkClass ? " dark" : ""}`}
    >
      <head>
        {theme === "system" ? <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} /> : null}
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider afterSignOutUrl="/sign-in">{children}</ClerkProvider>
      </body>
    </html>
  );
}
