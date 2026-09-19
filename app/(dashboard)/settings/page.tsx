import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, KeyRound } from "lucide-react";

import { NotificationPreferencesForm } from "@/components/shared/notification-preferences-form";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getCurrentProfile } from "@/services/profile";
import type { NotificationType } from "@/services/notifications";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const initialPrefs =
    (profile.notification_preferences as Partial<Record<NotificationType, boolean>> | null) ?? {};

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your account and workspace preferences.
        </p>
      </div>

      <section className="border-border bg-card space-y-3 rounded-lg border p-6">
        <h2 className="text-sm font-semibold">Theme</h2>
        <p className="text-muted-foreground text-sm">Choose how ErrorZero looks on this device.</p>
        <ThemeToggle />
      </section>

      <section className="border-border bg-card space-y-3 rounded-lg border p-6">
        <h2 className="text-sm font-semibold">Notification Preferences</h2>
        <NotificationPreferencesForm initialPrefs={initialPrefs} />
      </section>

      {profile.role === "admin" ? (
        <Link
          href="/settings/api-keys"
          className="border-border bg-card hover:border-primary/40 flex items-center justify-between rounded-lg border p-6 transition-colors"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="text-muted-foreground size-5" />
            <div>
              <h2 className="text-sm font-semibold">Automation API</h2>
              <p className="text-muted-foreground text-sm">
                Generate keys and see setup instructions for connecting Playwright.
              </p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground size-4" />
        </Link>
      ) : null}
    </div>
  );
}
