import { execFile } from 'node:child_process';
import { WindowsAdapterSnapshot } from '../../types/index.ts';
import { isAdapterCollection, isRecord } from '../../shared/advanced_scan_contract.ts';

export class NetworkConfigurationError extends Error {
  constructor(message: string, public readonly code: string) { super(message); }
}

export interface WindowsNetworkAdapterService {
  inspectAdapters(signal?: AbortSignal): Promise<WindowsAdapterSnapshot[]>;
  isAdministrator(signal?: AbortSignal): Promise<boolean>;
  applyTemporary(interfaceIndex: number, ipAddress: string, prefixLength: number): Promise<WindowsAdapterSnapshot>;
  restore(snapshot: WindowsAdapterSnapshot): Promise<WindowsAdapterSnapshot>;
}

const validIp = (value: string) => {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255);
};
const validIndex = (value: number) => Number.isInteger(value) && value > 0;
const validPrefix = (value: number) => Number.isInteger(value) && value >= 1 && value <= 30;

const excludedAdapter = /bluetooth|pangp|palo alto|vpn|tunnel|loopback|wi-?fi direct|wireless direct|hyper-v|virtual|tap|wireguard|vmware|virtualbox/i;

export function classifyWindowsAdapter(adapter: WindowsAdapterSnapshot): WindowsAdapterSnapshot {
  const physicalMedia = (adapter.physicalMediaType || '').toLowerCase().replace(/[\s_.-]+/g, '');
  const mediaType = physicalMedia === 'native80211' || physicalMedia === '80211'
    ? 'WIFI'
    : physicalMedia === '8023'
      ? 'ETHERNET'
      : 'OTHER';
  const active = adapter.operationalStatus.toLowerCase() === 'up';
  const hardware = adapter.hardwareInterface === true;
  const excluded = excludedAdapter.test(`${adapter.interfaceAlias} ${adapter.interfaceDescription || ''}`);
  const usableIpv4 = adapter.ipv4Addresses.some(ip => validIp(ip.address) && !ip.address.startsWith('127.'));
  const eligible = active && hardware && !excluded && mediaType !== 'OTHER' && usableIpv4;
  const eligibilityReason = eligible
    ? undefined
    : !active
      ? 'Adapter is disconnected or disabled.'
      : excluded || !hardware
        ? 'Virtual, tunnel, or non-hardware adapter is excluded.'
        : mediaType === 'OTHER'
          ? 'Adapter is not an eligible physical Ethernet or Wi-Fi interface.'
          : 'Adapter has no usable IPv4 address.';
  return { ...adapter, mediaType, eligible, eligibilityReason };
}

function runPowerShell(script: string, signal?: AbortSignal, purpose?: 'INSPECT'): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: purpose === 'INSPECT' ? 30_000 : 15_000, maxBuffer: 1024 * 1024, signal }, (error, stdout, stderr) => {
      if (error) {
        if (purpose === 'INSPECT') {
          const reason = signal?.aborted ? 'CANCELLED' : error.killed ? 'TIMEOUT' : /access.*denied|privilege/i.test(stderr) ? 'PERMISSION' : 'COMMAND_FAILED';
          reject(new NetworkConfigurationError(`Network adapter enumeration could not complete (${reason.toLowerCase().replaceAll('_',' ')}). Retry or inspect Diagnostics/Support.`, `ADAPTER_ENUMERATION_${reason}`)); return;
        }
        const text = stderr.trim();
        const accessDenied = /access.*denied|administrator|privilege/i.test(text);
        reject(new NetworkConfigurationError(accessDenied ? 'Administrator privileges are required to change this adapter.' : 'Windows could not complete the network adapter operation.', accessDenied ? 'ADMIN_REQUIRED' : 'POWERSHELL_FAILED'));
      } else resolve(stdout.trim());
    });
  });
}

const inspectScript = `
$ErrorActionPreference = 'Stop'
$allInterfaces = @(Get-NetIPInterface -AddressFamily IPv4)
$allAddresses = @(Get-NetIPAddress -AddressFamily IPv4)
$allGateways = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
$allDns = @(Get-DnsClientServerAddress -AddressFamily IPv4)
$adapters = Get-NetAdapter -ErrorAction Stop | ForEach-Object {
  $a = $_
  $ipif = $allInterfaces | Where-Object InterfaceIndex -eq $a.ifIndex | Select-Object -First 1
  $ips = @($allAddresses | Where-Object { $_.InterfaceIndex -eq $a.ifIndex -and $_.AddressState -ne 'Duplicate' } | ForEach-Object { [pscustomobject]@{ address=$_.IPAddress; prefixLength=$_.PrefixLength } })
  $gateways = @($allGateways | Where-Object InterfaceIndex -eq $a.ifIndex | Select-Object -ExpandProperty NextHop)
  $dns = $allDns | Where-Object InterfaceIndex -eq $a.ifIndex
  $registry = Get-ItemProperty -Path ("HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\" + $a.InterfaceGuid) -ErrorAction SilentlyContinue
  $description = [string]$a.InterfaceDescription
  $physicalMedia = [string]$a.PhysicalMediaType
  if ([string]::IsNullOrWhiteSpace($physicalMedia)) { $physicalMedia = [string]$a.NdisPhysicalMedium }
  $media = if ($physicalMedia -match 'Native[ _.-]*802[ _.]?11|802[ _.]?11') { 'WIFI' } elseif ($physicalMedia -match '802[ _.]?3') { 'ETHERNET' } else { 'OTHER' }
  $virtual = $description -match 'Hyper-V|Virtual|VPN|Tunnel|Loopback|Bluetooth|TAP|WireGuard|VMware|VirtualBox'
  $eligible = $a.Status -eq 'Up' -and $a.HardwareInterface -and -not $virtual -and ($media -eq 'ETHERNET' -or $media -eq 'WIFI')
  [pscustomobject]@{
    interfaceIndex=[int]$a.ifIndex; interfaceAlias=[string]$a.Name; interfaceDescription=$description; mediaType=$media;
    physicalMediaType=$physicalMedia; hardwareInterface=[bool]$a.HardwareInterface;
    operationalStatus=[string]$a.Status; eligible=$eligible;
    eligibilityReason=if($eligible){$null}elseif($a.Status -ne 'Up'){'Adapter is disconnected or disabled.'}elseif($virtual){'Virtual or tunnel adapter is excluded.'}else{'Adapter is not an eligible physical Ethernet or Wi-Fi interface.'};
    dhcpEnabled=([string]$ipif.Dhcp -eq 'Enabled'); ipv4Addresses=$ips; defaultGateways=$gateways;
    dnsAutomatic=([string]::IsNullOrWhiteSpace([string]$registry.NameServer)); dnsServers=@($dns.ServerAddresses); capturedAt=(Get-Date).ToUniversalTime().ToString('o')
  }
}
ConvertTo-Json -InputObject @($adapters) -Depth 6 -Compress`;

export function parseWindowsAdapterOutput(output: string): WindowsAdapterSnapshot[] {
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch { throw new NetworkConfigurationError('Windows returned an invalid adapter collection.', 'ADAPTER_ENUMERATION_MALFORMED_OUTPUT'); }
  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : null;
  // PowerShell emits [null] for an adapter with no DNS servers; retain absence without inventing values.
  const normalized = rows?.map(row => isRecord(row) ? { ...row, dnsServers: Array.isArray(row.dnsServers) ? row.dnsServers.filter(value => value !== null) : row.dnsServers } : row);
  if (!isAdapterCollection(normalized)) throw new NetworkConfigurationError('Windows returned an invalid adapter collection.', 'ADAPTER_ENUMERATION_MALFORMED_OUTPUT');
  return normalized.map(classifyWindowsAdapter);
}

export class PowerShellWindowsNetworkAdapterService implements WindowsNetworkAdapterService {
  private pendingInspection?: Promise<WindowsAdapterSnapshot[]>;
  constructor(private readonly inspectRunner = (script: string, signal?: AbortSignal) => runPowerShell(script, signal, 'INSPECT')) {}
  public async inspectAdapters(signal?: AbortSignal): Promise<WindowsAdapterSnapshot[]> {
    if (signal) return parseWindowsAdapterOutput(await this.inspectRunner(inspectScript, signal));
    if (!this.pendingInspection) this.pendingInspection = this.inspectRunner(inspectScript).then(parseWindowsAdapterOutput).finally(() => { this.pendingInspection = undefined; });
    return structuredClone(await this.pendingInspection);
  }

  public async isAdministrator(signal?: AbortSignal): Promise<boolean> {
    const output = await runPowerShell(`$p=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`, signal);
    return output.trim().toLowerCase() === 'true';
  }

  public async applyTemporary(interfaceIndex: number, ipAddress: string, prefixLength: number): Promise<WindowsAdapterSnapshot> {
    if (!validIndex(interfaceIndex) || !validIp(ipAddress) || !validPrefix(prefixLength)) throw new NetworkConfigurationError('Invalid adapter or temporary IPv4 configuration.', 'INVALID_INPUT');
    const script = `$i=${interfaceIndex}; $ip='${ipAddress}'; $prefix=${prefixLength};
$adapter=Get-NetAdapter -InterfaceIndex $i -ErrorAction Stop; if($adapter.Status -ne 'Up'){throw 'Adapter disconnected'}
Set-NetIPInterface -InterfaceIndex $i -AddressFamily IPv4 -Dhcp Disabled -ErrorAction Stop
Get-NetRoute -InterfaceIndex $i -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction Stop
Get-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction Stop
New-NetIPAddress -InterfaceIndex $i -IPAddress $ip -PrefixLength $prefix -AddressFamily IPv4 -ErrorAction Stop | Out-Null`;
    await runPowerShell(script);
    return this.getAdapter(interfaceIndex);
  }

  public async restore(snapshot: WindowsAdapterSnapshot): Promise<WindowsAdapterSnapshot> {
    if (!validIndex(snapshot.interfaceIndex) || snapshot.ipv4Addresses.some(ip => !validIp(ip.address) || !validPrefix(ip.prefixLength)) || snapshot.defaultGateways.some(gateway => !validIp(gateway)) || snapshot.dnsServers.some(server => !validIp(server))) throw new NetworkConfigurationError('The stored restoration snapshot is invalid.', 'INVALID_SNAPSHOT');
    const addresses = snapshot.ipv4Addresses.map(item => `@{Address='${item.address}';Prefix=${item.prefixLength}}`).join(',');
    const gateways = snapshot.defaultGateways.map(value => `'${value}'`).join(',');
    const dns = snapshot.dnsServers.map(value => `'${value}'`).join(',');
    const script = `$i=${snapshot.interfaceIndex}; $addresses=@(${addresses}); $gateways=@(${gateways}); $dns=@(${dns});
$adapter=Get-NetAdapter -InterfaceIndex $i -ErrorAction Stop
Get-NetRoute -InterfaceIndex $i -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction Stop
Get-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction Stop
if(${snapshot.dhcpEnabled ? '$true' : '$false'}) { Set-NetIPInterface -InterfaceIndex $i -AddressFamily IPv4 -Dhcp Enabled -ErrorAction Stop } else {
  Set-NetIPInterface -InterfaceIndex $i -AddressFamily IPv4 -Dhcp Disabled -ErrorAction Stop
  $first=$true; foreach($entry in $addresses){ if($first -and $gateways.Count -gt 0){New-NetIPAddress -InterfaceIndex $i -IPAddress $entry.Address -PrefixLength $entry.Prefix -DefaultGateway $gateways[0] -AddressFamily IPv4 -ErrorAction Stop|Out-Null;$first=$false}else{New-NetIPAddress -InterfaceIndex $i -IPAddress $entry.Address -PrefixLength $entry.Prefix -AddressFamily IPv4 -ErrorAction Stop|Out-Null;$first=$false} }
  if($gateways.Count -gt 1){ foreach($gateway in $gateways[1..($gateways.Count-1)]){ New-NetRoute -InterfaceIndex $i -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -NextHop $gateway -ErrorAction Stop | Out-Null } }
}
if(${snapshot.dnsAutomatic ? '$true' : '$false'}) { Set-DnsClientServerAddress -InterfaceIndex $i -ResetServerAddresses -ErrorAction Stop } elseif($dns.Count -gt 0) { Set-DnsClientServerAddress -InterfaceIndex $i -ServerAddresses $dns -ErrorAction Stop }`;
    await runPowerShell(script);
    return this.waitForRestored(snapshot);
  }

  private async getAdapter(interfaceIndex: number): Promise<WindowsAdapterSnapshot> {
    const adapter = (await this.inspectAdapters(new AbortController().signal)).find(item => item.interfaceIndex === interfaceIndex);
    if (!adapter) throw new NetworkConfigurationError('The selected network adapter no longer exists.', 'ADAPTER_NOT_FOUND');
    return adapter;
  }

  private async waitForRestored(snapshot: WindowsAdapterSnapshot): Promise<WindowsAdapterSnapshot> {
    let latest = await this.getAdapter(snapshot.interfaceIndex);
    for (let attempt = 0; attempt < 6; attempt++) {
      const modeReady = latest.dhcpEnabled === snapshot.dhcpEnabled && latest.dnsAutomatic === snapshot.dnsAutomatic;
      const addressReady = snapshot.dhcpEnabled || snapshot.ipv4Addresses.every(expected => latest.ipv4Addresses.some(actual => actual.address === expected.address && actual.prefixLength === expected.prefixLength));
      if (modeReady && addressReady) return latest;
      await new Promise(resolve => setTimeout(resolve, 500));
      latest = await this.getAdapter(snapshot.interfaceIndex);
    }
    return latest;
  }
}
