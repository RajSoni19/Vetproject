import "server-only";
import { validateBackendConfig } from "@/lib/server/config-validation";

// Deliberately lazy: frontend builds need no backend credentials.
// Every future backend service must call this before opening any connection.
// A valid configuration is not proof of role privileges or live connectivity.
export function getBackendConfig() {
  return validateBackendConfig(process.env);
}
