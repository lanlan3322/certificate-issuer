import { getCurrentIssuerUser } from "../../lib/auth";
import { hasPermission, isPlatformAdmin } from "../../lib/permissions";
import OrganizationWorkspace from "../../components/OrganizationWorkspace";
import { OrganizationService } from "../../services/OrganizationService";

export default async function OrganizationsPage() {
  const user = await getCurrentIssuerUser();
  if (!user || !hasPermission(user, "organizations.read")) {
    return <main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">Organization access required</h1><p role="alert">Sign in with an authorized organization account.</p></main>;
  }
  const organizations = isPlatformAdmin(user) ? await OrganizationService.list(true)
    : [await OrganizationService.getById(user.organizationId)].filter((org) => org !== null);
  return <OrganizationWorkspace initialOrganizations={organizations}
    canManage={hasPermission(user, "organizations.manage")}
    canManageMembers={hasPermission(user, "members.manage")} />;
}
