import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DemoNotice } from "@/components/DemoNotice";

export const metadata: Metadata = {
  title: "Chip-In",
  description: "Say what the group wants to buy. The agent collects on PayPal, buys when funded, refunds if not.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-white">¢</span>
              Chip-In
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">Pots</Link>
              <a href="https://github.com/SruthiKrish19/chip-in" className="hover:text-stone-900" target="_blank" rel="noreferrer">
                GitHub
              </a>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">PayPal sandbox</span>
            </nav>
          </div>
        </header>
        <DemoNotice />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
