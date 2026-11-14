// Inactive historical metadata retained for lossless browser-data preservation.
// It is never a paid entitlement, billing status or source of renewal warnings.
export type LegacySubscriptionPreferences = {
  periodStart: string; periodEnd: string; expiresOn: string;
  inAppReminders: boolean; emailReminders: boolean;
  renewalMethod: "Manual" | "Card" | "Direct Debit";
};
