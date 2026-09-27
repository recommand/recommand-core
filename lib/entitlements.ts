import { getInstalledApps } from "@recommand/lib/app";

/**
 * Entitlements are the commercial rights a team has, as opposed to permissions,
 * which decide what a user may do inside a team. A package that enforces a right
 * registers it here and asks for its effective value; it never learns why a team
 * has or lacks it.
 *
 * One package may resolve entitlements. It declares that in its package.json
 * (`"recommand": { "entitlementResolver": true }`) and registers its resolver when
 * it initializes. The resolver answers from its own current data, in process, so
 * a check never makes a request to another service.
 *
 * A deployment without such a package grants every entitlement. A deployment that
 * has one but whose resolver is not registered, because its initialization failed
 * or has not run yet, refuses the check instead of granting it.
 */

export type EntitlementDefinition = {
  id: string;
  name: string;
  description?: string;
};

export type EntitlementDecision = {
  allowed: boolean;
  /** Shown to the caller when the entitlement is withheld. May contain `{teamName}`. */
  message?: string | null;
  /** Where the team can resolve it. */
  actionUrl?: string | null;
};

export type EntitlementResolver = {
  /** The entitlements it resolves. Any other entitlement is granted. */
  entitlementIds: string[];
  resolve: (teamId: string, entitlementId: string, at: Date) => Promise<EntitlementDecision>;
};

export type EffectiveEntitlement = {
  entitlementId: string;
  allowed: boolean;
  /** False when nothing in this deployment resolves this entitlement. */
  managed: boolean;
  message: string | null;
  actionUrl: string | null;
};

export class EntitlementResolverUnavailableError extends Error {
  constructor() {
    super("Entitlements cannot be checked: the installed entitlement resolver is not registered");
    this.name = "EntitlementResolverUnavailableError";
  }
}

const registeredEntitlements: Record<string, EntitlementDefinition> = {};
let resolver: EntitlementResolver | null = null;

export function registerEntitlement(definition: EntitlementDefinition) {
  registeredEntitlements[definition.id] = definition;
}

export function getRegisteredEntitlements(): EntitlementDefinition[] {
  return Object.values(registeredEntitlements);
}

export function registerEntitlementResolver(next: EntitlementResolver) {
  if (resolver) {
    throw new Error("An entitlement resolver is already registered");
  }
  resolver = next;
}

/** For tests: forget the registered resolver. */
export function clearEntitlementResolver() {
  resolver = null;
}

function isResolverInstalled(): boolean {
  return getInstalledApps().some((app) => app.entitlementResolver);
}

/**
 * Replaces `{teamName}` in a resolver's message, so a message can address the team
 * by its current name.
 */
export function formatEntitlementMessage(
  message: string | null,
  context: { teamName?: string | null } = {}
): string | null {
  if (message === null) return null;
  return message.replaceAll("{teamName}", context.teamName ?? "");
}

/**
 * The effective value of an entitlement for a team at `at` (default now). A
 * resolver that fails makes the check fail; it is never read as a grant.
 */
export async function getEffectiveEntitlement(
  teamId: string,
  entitlementId: string,
  options: { at?: Date } = {}
): Promise<EffectiveEntitlement> {
  const current = resolver;
  if (!current) {
    if (isResolverInstalled()) {
      throw new EntitlementResolverUnavailableError();
    }
    return { entitlementId, allowed: true, managed: false, message: null, actionUrl: null };
  }
  if (!current.entitlementIds.includes(entitlementId)) {
    return { entitlementId, allowed: true, managed: false, message: null, actionUrl: null };
  }

  const decision = await current.resolve(teamId, entitlementId, options.at ?? new Date());
  return {
    entitlementId,
    allowed: decision.allowed,
    managed: true,
    message: decision.allowed ? null : (decision.message ?? null),
    actionUrl: decision.allowed ? null : (decision.actionUrl ?? null),
  };
}

export async function getEffectiveEntitlements(
  teamId: string,
  entitlementIds: string[],
  options: { at?: Date } = {}
): Promise<EffectiveEntitlement[]> {
  const at = options.at ?? new Date();
  return await Promise.all(
    entitlementIds.map((entitlementId) => getEffectiveEntitlement(teamId, entitlementId, { at }))
  );
}
