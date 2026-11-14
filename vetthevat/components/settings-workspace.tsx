"use client";

import { AccountProfile } from "@/components/account-profile";
import { WebSessions } from "@/components/web-sessions";
import { PasswordChange } from "@/components/password-change";
import { Card } from "@/components/ui/card";
import { useAppState } from "@/components/app-state";
import { useLocale } from "@/components/locale-provider";
import { Settings, Shield, User, Globe } from "lucide-react";

export function SettingsWorkspace() {
  const { selectedCompany, settings, saveSettings } = useAppState();
  const { t, locale, setLocale } = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-brand-700" />
          <h1 className="text-2xl font-bold">Settings &amp; Security</h1>
        </div>
        <p className="mt-1 text-sm text-muted">
          Manage your account profile, active security sessions, password, and workspace preferences.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Account Profile */}
        <AccountProfile />

        {/* Workspace & Notification Preferences */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <User className="h-5 w-5 text-brand-700" />
            Workspace &amp; Company Preferences
          </h2>
          <p className="mt-1 text-sm text-muted">Preferences for {selectedCompany?.name || "your workspace"}.</p>
          <div className="mt-5 grid max-w-xl gap-4">
            <label className="grid gap-1 text-sm font-semibold">
              Profile display name
              <input
                className="field-control"
                value={settings?.profileName || ""}
                maxLength={100}
                onChange={(e) => saveSettings({ ...settings, profileName: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={settings?.notificationsEnabled ?? false}
                onChange={(e) => saveSettings({ ...settings, notificationsEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-500"
              />
              Enable in-app notifications
            </label>
            <div className="grid gap-1 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-muted" /> Display Language
              </span>
              <select
                className="field-control"
                value={locale}
                onChange={(e) => setLocale(e.target.value as any)}
              >
                <option value="en-GB">English (United Kingdom)</option>
                <option value="hi-IN">हिन्दी (Hindi)</option>
                <option value="gu-IN">ગુજરાતી (Gujarati)</option>
                <option value="es-ES">Español (Spanish)</option>
                <option value="ar-SA">العربية (Arabic)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Security Sessions */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Shield className="h-5 w-5 text-brand-700" />
            Active Sessions &amp; Security
          </h2>
          <p className="mt-1 text-sm text-muted">Review authenticated devices and sessions.</p>
          <div className="mt-4">
            <WebSessions />
          </div>
        </Card>

        {/* Change Password */}
        <Card className="p-5">
          <PasswordChange />
        </Card>
      </div>
    </div>
  );
}
