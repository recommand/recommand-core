import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const IPV4_NON_PUBLIC: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const IPV6_NON_PUBLIC: Array<[string, number]> = [
  // Also the deprecated IPv4-compatible addresses, which embed any IPv4 address
  ["::", 96],
  // NAT64 addresses could point at any IPv4 address
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  // 6to4 addresses embed an IPv4 address too
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

const nonPublic = new BlockList();
IPV4_NON_PUBLIC.forEach(([network, prefix]) => nonPublic.addSubnet(network, prefix, "ipv4"));
IPV6_NON_PUBLIC.forEach(([network, prefix]) => nonPublic.addSubnet(network, prefix, "ipv6"));

export const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export const isPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }

  if (family === 4) {
    return !nonPublic.check(address, "ipv4");
  }

  // An IPv4-mapped address could point at any IPv4 address. It isn't in the block
  // list, since Bun also applies that range to every IPv4 address.
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  return !canonical.startsWith("::ffff:") && !nonPublic.check(address, "ipv6");
};

/**
 * Resolves a host and refuses it unless every address it resolves to is public,
 * so a request made on a client's behalf can't reach this server's own network.
 */
/** A host that resolves to an address this server must not contact. */
export class NonPublicAddressError extends Error {}

export const resolvePublicAddresses = async (hostname: string, lookup: Lookup = defaultLookup): Promise<string[]> => {
  // URL hostnames keep the brackets of an IPv6 literal
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  const addresses = isIP(host) ? [host] : (await lookup(host)).map(({ address }) => address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new NonPublicAddressError(`${hostname} does not resolve to public addresses only`);
  }

  return addresses;
};
