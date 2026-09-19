"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bug,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  UserRound,
  Users,
  Webhook,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/services/profile";

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Profile["role"][];
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/bugs", label: "Bugs", icon: Bug },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/users", label: "Users", icon: Users, roles: ["admin"] },
  { href: "/settings/api-keys", label: "Automation API", icon: Webhook, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppSidebar({
  mobileOpen,
  onClose,
  profile,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  profile: Profile;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(profile.role),
  );
  const canCreateBugs = profile.role !== "viewer";

  // Pick the longest matching href so a more specific item (e.g.
  // /settings/api-keys) wins over a shared prefix (e.g. /settings).
  const bestMatchHref = visibleNavItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .map((item) => item.href)
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "border-border bg-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r transition-transform duration-200 md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between px-5 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="ErrorZero" width={28} height={28} className="rounded-sm" />
            <div>
              <span className="text-primary text-lg font-bold">ErrorZero</span>
              <p className="text-muted-foreground text-xs">Bug Tracker &amp; Management</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Close menu"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        {canCreateBugs ? (
          <div className="px-4">
            <Button
              render={<Link href="/bugs/new" onClick={onClose} />}
              className="w-full justify-center"
            >
              <Plus /> New Bug
            </Button>
          </div>
        ) : null}

        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 pt-6">
          {visibleNavItems.map(({ href, label, icon: Icon }) => {
            const active = href === bestMatchHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-border space-y-3 border-t px-3 py-4">
          <div className="px-3">
            <p className="text-foreground truncate text-sm font-medium">{profile.full_name}</p>
            <p className="text-muted-foreground text-xs capitalize">{profile.role}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
