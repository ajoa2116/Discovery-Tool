import { Device, NICInfo, WindowsAdapterSnapshot } from '../../types/index.ts';

function canonicalIPv4(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.map(part => String(Number(part))).join('.');
}

export class LocalHostIdentity {
  private constructor(private readonly addresses: Set<string>) {}

  public static fromInterfaces(interfaces: NICInfo[]): LocalHostIdentity {
    return LocalHostIdentity.fromAddresses(interfaces.map(value => value.ipAddress));
  }

  public static fromAdapters(adapters: WindowsAdapterSnapshot[]): LocalHostIdentity {
    return LocalHostIdentity.fromAddresses(adapters.flatMap(adapter => adapter.ipv4Addresses.map(value => value.address)));
  }

  public static fromAddresses(addresses: Iterable<string>): LocalHostIdentity {
    const normalized = new Set<string>();
    for (const address of addresses) {
      const value = canonicalIPv4(address);
      if (value && value !== '0.0.0.0') normalized.add(value);
    }
    return new LocalHostIdentity(normalized);
  }

  public isLocal(address: string): boolean {
    const normalized = canonicalIPv4(address);
    return normalized !== null && this.addresses.has(normalized);
  }

  public isRemoteDevice(device: Device): boolean {
    return !this.isLocal(device.network.ipAddress);
  }

  public values(): string[] { return [...this.addresses]; }
}
