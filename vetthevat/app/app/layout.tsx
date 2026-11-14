import type { Metadata } from "next";
import {redirect} from "next/navigation";
import {requireWebSession} from "@/lib/server/admin-auth";
import {administratorAuthServices} from "@/lib/server/admin-services";
import {AuthenticatedSession} from "@/components/authenticated-session";
import {AppStateProvider} from "@/components/app-state";
import {NavigationGuardProvider} from "@/components/navigation-guard";
import {AppShell} from "@/components/app-shell";
import {ServerWorkspace} from "@/components/server-workspace";
import {manualInvoicesEnabled,orsEnabled,orsShoppingEnabled} from "@/lib/server/saas/manual-activation";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let principal;
  try{principal=await requireWebSession();}catch{redirect("/login?setup=required");}
  const services=administratorAuthServices();
  if(!services)redirect("/login?setup=required");
  const administrator=principal.roles.includes("software_administrator");
  // With the business database configured, every company record is read from
  // and saved to it (ServerWorkspace). The browser-storage workspace remains
  // only for installations without a database.
  if(manualInvoicesEnabled(process.env)){
    return (
      <AuthenticatedSession>
        <NavigationGuardProvider>
          <ServerWorkspace administrator={administrator} manualEnabled orsEnabled={orsEnabled(process.env)} shoppingEnabled={orsShoppingEnabled(process.env)}>
            {children}
          </ServerWorkspace>
        </NavigationGuardProvider>
      </AuthenticatedSession>
    );
  }
  return (
    <AuthenticatedSession>
      <NavigationGuardProvider>
        <AppStateProvider storageNamespace="vetthevat">
          <AppShell softwareAdministrator={administrator}>
            {children}
          </AppShell>
        </AppStateProvider>
      </NavigationGuardProvider>
    </AuthenticatedSession>
  );
}
