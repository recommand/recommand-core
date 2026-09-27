import { afterEach, describe, expect, it } from "bun:test";
import { setInstalledApps } from "@recommand/lib/app";
import {
  clearEntitlementResolver,
  EntitlementResolverUnavailableError,
  formatEntitlementMessage,
  getEffectiveEntitlement,
  registerEntitlementResolver,
} from "../lib/entitlements";

// What an entitlement check answers with no resolver, with one, with one that
// fails, and with one that is installed but was never registered.

const TEAM = "team_1";
const RIGHT = "product.feature";

afterEach(() => {
  clearEntitlementResolver();
  setInstalledApps([]);
});

describe("entitlements", () => {
  it("grants everything when no package resolves entitlements", async () => {
    expect(await getEffectiveEntitlement(TEAM, RIGHT)).toEqual({
      entitlementId: RIGHT,
      allowed: true,
      managed: false,
      message: null,
      actionUrl: null,
    });
  });

  it("refuses the check when a resolver is installed but not registered", async () => {
    setInstalledApps([{ name: "billing", absolutePath: "/billing", entitlementResolver: true }]);
    await expect(getEffectiveEntitlement(TEAM, RIGHT)).rejects.toBeInstanceOf(EntitlementResolverUnavailableError);
  });

  it("returns the resolver's answer for the entitlements it resolves, at the moment asked", async () => {
    const asked: Date[] = [];
    registerEntitlementResolver({
      entitlementIds: [RIGHT],
      resolve: async (_teamId, _entitlementId, at) => {
        asked.push(at);
        return { allowed: false, message: "Team {teamName} has no plan", actionUrl: "/plans" };
      },
    });

    const at = new Date("2026-10-01T00:00:00.000Z");
    const result = await getEffectiveEntitlement(TEAM, RIGHT, { at });
    expect(result).toEqual({
      entitlementId: RIGHT,
      allowed: false,
      managed: true,
      message: "Team {teamName} has no plan",
      actionUrl: "/plans",
    });
    expect(asked).toEqual([at]);
    expect(formatEntitlementMessage(result.message, { teamName: "Acme" })).toBe("Team Acme has no plan");

    // Anything it does not resolve is granted.
    expect((await getEffectiveEntitlement(TEAM, "product.other")).allowed).toBe(true);
  });

  it("drops the message of a granted entitlement", async () => {
    registerEntitlementResolver({
      entitlementIds: [RIGHT],
      resolve: async () => ({ allowed: true, message: "ignored", actionUrl: "/ignored" }),
    });
    expect(await getEffectiveEntitlement(TEAM, RIGHT)).toMatchObject({ allowed: true, message: null, actionUrl: null });
  });

  it("fails the check when the resolver fails, instead of granting", async () => {
    registerEntitlementResolver({
      entitlementIds: [RIGHT],
      resolve: async () => {
        throw new Error("database unavailable");
      },
    });
    await expect(getEffectiveEntitlement(TEAM, RIGHT)).rejects.toThrow("database unavailable");
  });

  it("accepts one resolver only", () => {
    const resolver = { entitlementIds: [], resolve: async () => ({ allowed: true }) };
    registerEntitlementResolver(resolver);
    expect(() => registerEntitlementResolver(resolver)).toThrow("already registered");
  });
});
