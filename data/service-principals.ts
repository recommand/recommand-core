import { sign } from "@core/lib/jwt";
import { addDays } from "date-fns";
import { ulid } from "ulid";

export const SERVICE_TOKEN_TYPE = "service";

type ServicePrincipal = {
  id: string;
  jti: string;
  token: string;
};

// Service principals are stored locally and are used to authenticate local communication between packages while still plugging into the core event system.
// They do not allow communication between deployments, as they are kept in memory and not persisted to the database.
// That is by design and no issue as local communication always happens on the same deployment.
const servicePrincipals = new Map<string, ServicePrincipal>();

export async function registerServicePrincipal(id: string): Promise<string> {
  const existing = servicePrincipals.get(id);
  if (existing) {
    return existing.token;
  }

  const jti = "svc_" + ulid();
  const token = await sign(
    {
      sub: id,
      jti,
      tokenType: SERVICE_TOKEN_TYPE,
    },
    addDays(new Date(), 365)
  );

  servicePrincipals.set(id, {
    id,
    jti,
    token,
  });

  return token;
}

export function isValidServiceToken(id: string, jti: string): boolean {
  const principal = servicePrincipals.get(id);
  return !!principal && principal.jti === jti;
}

export function getServiceToken(id: string): string | null {
  return servicePrincipals.get(id)?.token ?? null;
}

// Service principals are local, in-process consumers registered by packages in this
// deployment. They are trusted with every team-scoped permission; the registration check
// in `verifySession` is what gates them.
export function serviceHasPermission(): boolean {
  return true;
}
