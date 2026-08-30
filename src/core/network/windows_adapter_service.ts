import { execFile } from 'node:child_process';
import { WindowsAdapterSnapshot } from '../../types/index.ts';

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

function runPowerShell(script: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, signal }, (error, stdout, stderr) => {
      if (error) {
        const text = stderr.trim();
        const accessDenied = /access.*denied|administrator|privilege/i.test(text);
        reject(new NetworkConfigurationError(accessDenied ? 'Administrator privileges are required to change this adapter.' : 'Windows could not complete the network adapter operation.', accessDenied ? 'ADMIN_REQUIRED' : 'POWERSHELL_FAILED'));
      } else resolve(stdout.trim());
    });
  });
}

const inspectScript = `
$adapters = Get-NetAdapter -ErrorAction Stop | ForEach-Object {
  $a = $_
  $ipif = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
  $ips = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object AddressState -ne Duplicate | ForEach-Object { [pscustomobject]@{ address=$_.IPAddress; prefixLength=$_.PrefixLength } })
  $gateways = @(Get-NetRoute -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty NextHop)
  $dns = Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
  $registry = Get-ItemProperty -Path ("HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\" + $a.InterfaceGuid) -ErrorAction SilentlyContinue
  $description = [string]$a.InterfaceDescription
  $media = if ($a.NdisPhysicalMedium -match 'Wireless|802.11') { 'WIFI' } elseif ($a.NdisPhysicalMedium -match '802.3|Ethernet') { 'ETHERNET' } else { 'OTHER' }
  $virtual = $description -match 'Hyper-V|Virtual|VPN|Tunnel|Loopback|Bluetooth|TAP|WireGuard|VMware|VirtualBox'
  $eligible = $a.Status -eq 'Up' -and $a.HardwareInterface -and -not $virtual -and ($media -eq 'ETHERNET' -or $media -eq 'WIFI')
  [pscustomobject]@{
    interfaceIndex=[int]$a.ifIndex; interfaceAlias=[string]$a.Name; interfaceDescription=$description; mediaType=$media;
    operationalStatus=[string]$a.Status; eligible=$eligible;
    eligibilityReason=if($eligible){$null}elseif($a.Status -ne 'Up'){'Adapter is disconnected or disabled.'}elseif($virtual){'Virtual or tunnel adapter is excluded.'}else{'Adapter is not an eligible physical Ethernet or Wi-Fi interface.'};
    dhcpEnabled=([string]$ipif.Dhcp -eq 'Enabled'); ipv4Addresses=$ips; defaultGateways=$gateways;
    dnsAutomatic=([string]::IsNullOrWhiteSpace([string]$registry.NameServer)); dnsServers=@($dns.ServerAddresses); capturedAt=(Get-Date).ToUniversalTime().ToString('o')
  }
}
@($adapters) | ConvertTo-Json -Depth 6 -Compress`;

export class PowerShellWindowsNetworkAdapterService implements WindowsNetworkAdapterService {
  public async inspectAdapters(signal?: AbortSignal): Promise<WindowsAdapterSnapshot[]> {
    const output = await runPowerShell(inspectScript, signal);
    if (!output) return [];
    const parsed = JSON.parse(output) as WindowsAdapterSnapshot[] | WindowsAdapterSnapshot;
    return (Array.isArray(parsed) ? parsed : [parsed]).map(adapter => ({ ...adapter, ipv4Addresses: adapter.ipv4Addresses || [], defaultGateways: adapter.defaultGateways || [], dnsServers: adapter.dnsServers || [] }));
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
    const adapter = (await this.inspectAdapters()).find(item => item.interfaceIndex === interfaceIndex);
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
