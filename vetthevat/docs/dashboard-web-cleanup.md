# Dashboard and public website sample cleanup

20 October 2026. Localhost application only. No deployment, database/Firebase
access, package installation or immutable backup changes.

Removed stale dashboard/audit claims that demo seeds are displayed, and replaced
workspace sample-data wording with browser-local records. Public pages import
site links from a dedicated module rather than old mock/fixture data modules.
The public VAT calculator starts blank, with no invented amount or checked review
items; calculated results appear only after an amount is entered. Arithmetic was
not changed. Existing desktop/mobile product previews already contain empty states.

Existing automatic unchanged-sample cleanup remains in place, with its browser-local
recovery copy and safeguards for edited/user-linked records. No owner browser
profile was opened or wiped. Local storage and unavailable-authentication notices
remain; removing samples does not make integrations operational.

Validation: production build and TypeScript passed; 73 automated tests passed.
Focused browser check passed first company creation, empty dashboard, absence of
stale sample labels/public example values, unchecked checklist and calculation from
user-entered amounts. Uses a fresh synthetic profile, not owner data.

Reload the localhost application (Ctrl+Shift+R) to load current code and execute
startup sample cleanup. Existing user-created records are retained. If a previously
built server still serves old assets, its local process needs a normal restart;
no server was stopped automatically and no browser storage reset was performed.

Recoverable originals: .recovery/dashboard-web-cleanup-20261020-211844.
The pre-change browser harness was reconstructed and verified byte-for-byte against
its prior recorded SHA-256 before saving the recovery copy. See change inventory.
