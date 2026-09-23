"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";

type Props = { user: { name: string; email: string } | null };

export default function AppShell({
  user,
  children,
}: Props & { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navLink = (href: string, label: string, key: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        key={key}
        href={href}
        className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
        onClick={() => setOpen(false)}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="shell-layout">
      <button
        className="sidebar-toggle"
        aria-label="Toggle navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">HB</span>
          <span className="sidebar-brand-text">
            Homebase
            <strong>AI project tracker</strong>
          </span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">{navLink("/", "Overview", "overview")}</div>

          <div className="sidebar-section">
            <span className="sidebar-heading">Active projects</span>
            {TRACKER_PROJECTS.map((p) => navLink(`/projects/${p.key}`, p.name, p.key))}
          </div>

          <div className="sidebar-section">
            <span className="sidebar-heading">Done</span>
            {DONE_PROJECTS.map((p) => navLink(p.href, p.name, p.key))}
          </div>
        </nav>

        {user ? (
          <div className="sidebar-user">
            <span className="sidebar-user-name">{user.name}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="sidebar-signout">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </aside>

      <main className="shell-content">{children}</main>
    </div>
  );
}
