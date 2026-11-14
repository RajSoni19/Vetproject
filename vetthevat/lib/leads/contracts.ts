export const leadServices = ["VAT Management", "ORS", "VAT + ORS"] as const;
export const leadStatuses = ["new", "contacted", "qualified", "closed"] as const;
export const leadPrivacyVersion = "lead-contact-v1";
export type LeadService = typeof leadServices[number];
export type LeadStatus = typeof leadStatuses[number];
export type LeadInput = { fullName: string; email: string; phone: string; businessName: string; service: LeadService; requirements: string; consent: true };
export type LeadFields = Partial<Record<keyof LeadInput, string>>;
export class LeadValidationError extends Error {
  readonly fields: LeadFields;
  constructor(fields: LeadFields) { super("Please check the highlighted fields."); this.fields = fields; }
}
export function validateLead(value: unknown): LeadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LeadValidationError({ fullName: "Enter your details." });
  const row = value as Record<string, unknown>, fields: LeadFields = {};
  if (Object.keys(row).some(key => !["fullName", "email", "phone", "businessName", "service", "requirements", "consent"].includes(key))) throw new LeadValidationError({ fullName: "Unexpected form fields. Refresh the page and try again." });
  const text = (key: "fullName" | "email" | "phone" | "businessName" | "requirements", max: number, required = true) => {
    const raw = row[key];
    if (typeof raw !== "string" || raw.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw) || key !== "requirements" && /[\r\n]/.test(raw)) { fields[key] = `Use at most ${max} characters without control characters.`; return ""; }
    const normalized = raw.normalize("NFKC").trim();
    const result = key === "requirements" ? normalized.replace(/\r\n?/g, "\n") : normalized.replace(/\s+/g, " ");
    if (required && !result || result.length > max) fields[key] = required && !result ? "This field is required." : `Use at most ${max} characters.`;
    return result;
  };
  const fullName = text("fullName", 120), businessName = text("businessName", 200), email = text("email", 254).toLowerCase(), phone = text("phone", 40), requirements = text("requirements", 3000, false);
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/i.test(email) || email.includes("..") || email.split("@")[0].length > 64) fields.email = "Enter a valid business email address.";
  // All valid email domains accepted; do not misclassify sole traders' addresses.
  if (!/^\+?[0-9 ()\-.]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15) fields.phone = "Enter a phone number with 7–15 digits, including a country code if needed.";
  if (!leadServices.includes(row.service as LeadService)) fields.service = "Choose VAT Management, ORS or VAT + ORS.";
  if (row.consent !== true) fields.consent = "Consent to be contacted is required.";
  if (Object.keys(fields).length) throw new LeadValidationError(fields);
  return { fullName, email, phone, businessName, service: row.service as LeadService, requirements, consent: true };
}
