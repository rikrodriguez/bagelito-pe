"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  CalendarClock,
  Calculator,
  CreditCard,
  Home,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  PanelLeftClose,
  ReceiptText,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminSection =
  | "overview"
  | "customers"
  | "crm"
  | "finance"
  | "calculator"
  | "batch"
  | "waitlist"
  | "comms"
  | "production"
  | "delivery"
  | "insights"
  | "archive";

type AdminNavIcon =
  | "overview"
  | "customers"
  | "crm"
  | "finance"
  | "calculator"
  | "batch"
  | "waitlist"
  | "comms"
  | "production"
  | "delivery"
  | "insights"
  | "archive";

type AdminNavItem = {
  section: AdminSection;
  label: string;
  helper: string;
  href: string;
  icon: AdminNavIcon;
};

const navIconMap: Record<AdminNavIcon, LucideIcon> = {
  overview: Home,
  customers: Users,
  crm: ReceiptText,
  finance: CreditCard,
  calculator: Calculator,
  batch: CalendarClock,
  waitlist: UserPlus,
  comms: MessageCircle,
  production: Package,
  delivery: MapPin,
  insights: ArrowUpDown,
  archive: Archive,
};

const storageKey = "bagelito-admin-nav-collapsed";

export function AdminSectionNav({
  activeSection,
  items,
}: {
  activeSection: AdminSection;
  items: AdminNavItem[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    document.documentElement.dataset.adminNavCollapsed = collapsed ? "1" : "0";
  }, [collapsed, hydrated]);

  useEffect(() => () => {
    delete document.documentElement.dataset.adminNavCollapsed;
  }, []);

  return (
    <aside
      aria-label="Admin sections"
      className={`admin-side-nav${collapsed ? " is-collapsed" : ""}${hydrated ? " is-hydrated" : ""}`}
    >
      <div className="admin-side-nav-toolbar">
        <div className="admin-side-nav-head">
          <span>Admin Menu</span>
          <strong>Bagelito Ops</strong>
        </div>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand admin menu" : "Collapse admin menu"}
          className="admin-side-toggle"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          {collapsed ? <Menu size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav>
        {items.map((item) => {
          const Icon = navIconMap[item.icon];
          const active = item.section === activeSection;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
              href={item.href}
              key={item.section}
              title={`${item.label} · ${item.helper}`}
            >
              <Icon size={17} />
              <span className="admin-side-nav-copy">
                {item.label}
                <small>{item.helper}</small>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
