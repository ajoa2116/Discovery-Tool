param([int]$InterfaceIndex,[string]$BackendExecutable)
$ErrorActionPreference='Stop'
$observation=[ordered]@{observedAt=[DateTime]::UtcNow.ToString('o');backendExecutable=$BackendExecutable;interfaceIndex=$InterfaceIndex}
function Observe-Section($Name,$Action) { try { $observation[$Name]=@(& $Action) } catch { $observation[$Name]=@{status='UNAVAILABLE'} } }
Observe-Section 'adapters' { Get-NetAdapter | Where-Object ifIndex -eq $InterfaceIndex | Select-Object Name,InterfaceDescription,Status,LinkSpeed }
Observe-Section 'ipInterfaces' { Get-NetIPInterface -InterfaceIndex $InterfaceIndex -AddressFamily IPv4 | Select-Object InterfaceAlias,InterfaceIndex,InterfaceMetric,NlMtu,@{n='WeakHostSend';e={$_.WeakHostSend.ToString()}},@{n='WeakHostReceive';e={$_.WeakHostReceive.ToString()}},@{n='Forwarding';e={$_.Forwarding.ToString()}} }
Observe-Section 'addresses' { Get-NetIPAddress -InterfaceIndex $InterfaceIndex -AddressFamily IPv4 | Select-Object IPAddress,PrefixLength,AddressState }
Observe-Section 'routes' { Get-NetRoute -InterfaceIndex $InterfaceIndex -AddressFamily IPv4 | Select-Object -First 32 DestinationPrefix,NextHop,RouteMetric }
Observe-Section 'profiles' { Get-NetConnectionProfile -InterfaceIndex $InterfaceIndex | Select-Object InterfaceAlias,@{n='Category';e={$_.NetworkCategory.ToString()}} }
Observe-Section 'bindings' { $nic=Get-NetAdapter | Where-Object ifIndex -eq $InterfaceIndex; Get-NetAdapterBinding -Name $nic.Name | Where-Object Enabled | Select-Object -First 32 DisplayName,ComponentID }
Observe-Section 'firewallProfiles' { Get-NetFirewallProfile -PolicyStore ActiveStore | Select-Object Name,@{n='Enabled';e={$_.Enabled.ToString()}},@{n='Inbound';e={$_.DefaultInboundAction.ToString()}} }
Observe-Section 'applicationRules' {
 Get-NetFirewallApplicationFilter -PolicyStore ActiveStore | Where-Object { $_.Program -eq $BackendExecutable } | Get-NetFirewallRule | Where-Object Direction -eq Inbound | Select-Object -First 32 | ForEach-Object {
  $rule=$_;$port=$rule|Get-NetFirewallPortFilter;$address=$rule|Get-NetFirewallAddressFilter;$service=$rule|Get-NetFirewallServiceFilter
  [pscustomobject]@{name=$rule.DisplayName;program=$BackendExecutable;enabled=$rule.Enabled.ToString();direction=$rule.Direction.ToString();action=$rule.Action.ToString();profile=$rule.Profile.ToString();protocol=$port.Protocol;localPort=$port.LocalPort;remoteAddress=$address.RemoteAddress;localAddress=$address.LocalAddress;edgeTraversal=$rule.EdgeTraversalPolicy.ToString();service=$service.Service}
 }
}
$observation['interpretation']='READ_ONLY_OBSERVATION_NOT_EFFECTIVE_POLICY_PROOF'
$observation|ConvertTo-Json -Depth 8
