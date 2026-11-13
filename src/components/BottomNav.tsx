"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAsk, IconBook, IconHome, IconPulse } from "@/components/Icons";

export function BottomNav({ onAsk }: { onAsk: () => void }) {
  const pathname = usePathname();

  const items = [
    {
      href: "/home",
      label: "Home",
      icon: IconHome,
      match: (p: string) => p === "/home" || p === "/",
    },
    {
      href: "/search",
      label: "Search",
      icon: IconBook,
      match: (p: string) =>
        p.startsWith("/search") || p.startsWith("/research") || p.startsWith("/filing"),
    },
    {
      href: "/guardian",
      label: "Protect",
      icon: IconPulse,
      match: (p: string) =>
        p.startsWith("/guardian") ||
        p.startsWith("/risk") ||
        p.startsWith("/portfolio") ||
        p.startsWith("/performance"),
    },
  ] as const;

  return (
    <div className="bottom-nav">
      <nav className="nav-bar" aria-label="Primary">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
              <Icon active={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button type="button" className="nav-item" onClick={onAsk} aria-label="Ask FINN">
          <IconAsk />
          <span>Ask</span>
        </button>
      </nav>
    </div>
  );
}
