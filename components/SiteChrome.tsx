import Link from "next/link";
import { ShieldCheckIcon } from "@/components/icons";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <Link
          href="/"
          className="-mx-2 inline-flex min-h-11 items-center gap-2 rounded-button px-2"
        >
          <ShieldCheckIcon className="size-7 text-accent" />
          <span className="text-xl font-semibold text-ink">ClariMail</span>
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-6 text-ink-soft sm:px-6">
        © 2026 ClariMail
      </div>
    </footer>
  );
}
