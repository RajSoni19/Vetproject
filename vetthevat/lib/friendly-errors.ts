// Turns technical error messages into plain words for people using the app.
// Messages that are already plain are returned unchanged.
const NOT_READY = "This feature isn't available yet. Please contact support if you need it.";
const RULES: [RegExp, string][] = [
  [/if-match|idempotency|stale version|version (?:conflict|mismatch)|changed by another|already been changed/i, "This record was changed somewhere else. Refresh the page and try again."],
  [/schema|migration|approv(?:al|ed) (?:package|schema)|separately approved|awaiting (?:its |the )?(?:reviewed|separately|approval|acceptance)|not enabled for this (?:installation|database|database schema)|reviewed (?:package|migration)|explicit activation|isolated|\bUAT\b/i, NOT_READY],
  [/not configured|configuration|provider (?:state|configuration)|worker|lease expired|decoder|postgres|database|backend|runtime/i, "This service is temporarily unavailable. Please try again in a few minutes."],
  [/entitlement/i, "Your plan doesn't include this. Please check your subscription."],
  [/server could not confirm|could not be confirmed|service unavailable|services are unavailable/i, "Something went wrong. Please try again."]
];
export function friendlyErrorMessage(message: string): string {
  for (const [pattern, text] of RULES) if (pattern.test(message)) return text;
  return message;
}
