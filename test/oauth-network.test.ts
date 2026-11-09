import { describe, expect, test } from 'bun:test';
import { isPublicAddress, resolvePublicAddresses } from '../lib/oauth/network';

describe('isPublicAddress', () => {
  test('accepts public addresses', () => {
    for (const address of ['8.8.8.8', '151.101.1.69', '2606:4700::6810:84e5']) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });
  test('refuses loopback, private, link-local, shared, reserved and mapped addresses', () => {
    for (const address of [
      '0.0.0.0',
      '10.1.2.3',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '0:0:0:0:0:ffff:a00:1',
      '64:ff9b::a00:1',
      '64:ff9b:1::a00:1',
      '::a00:1',
      '2002:a00:1::',
      'fd00::1',
      'fe80::1',
      'ff02::1',
      'not-an-address',
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});

describe('resolvePublicAddresses', () => {
  const lookup = (addresses: string[]) => async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  test('returns the addresses of a host that resolves to public ones only', async () => {
    expect(await resolvePublicAddresses('client.example', lookup(['93.184.215.14']))).toEqual(['93.184.215.14']);
  });
  test('refuses a host with any non-public address', async () => {
    await expect(resolvePublicAddresses('client.example', lookup(['93.184.215.14', '10.0.0.1']))).rejects.toThrow();
  });
  test('refuses a host that resolves to nothing', async () => {
    await expect(resolvePublicAddresses('client.example', lookup([]))).rejects.toThrow();
  });
  test('checks address literals without a lookup, IPv6 in brackets too', async () => {
    const unused = async () => {
      throw new Error('looked up');
    };
    await expect(resolvePublicAddresses('[::1]', unused)).rejects.toThrow('does not resolve');
    await expect(resolvePublicAddresses('127.0.0.1', unused)).rejects.toThrow('does not resolve');
  });
});
