param([Parameter(Mandatory=$true)][string]$InterfaceIPv4,[ValidateRange(15,20)][int]$Seconds=20)
$ErrorActionPreference='Stop'
# Optional standalone control. Run only after stopping competing discovery listeners.
$backend=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)
if($backend.Count){[pscustomobject]@{status='CONFLICTING_PORT_OWNER';reason='Stop backend before standalone native comparison'}|ConvertTo-Json;exit 2}
$owners=@(Get-NetUDPEndpoint | Where-Object LocalPort -eq 3702)
if($owners.Count){ [pscustomobject]@{status='CONFLICTING_PORT_OWNER';owners=@($owners|Select-Object LocalAddress,LocalPort,OwningProcess)}|ConvertTo-Json -Depth 4;exit 2 }
$local=[Net.IPAddress]::Parse($InterfaceIPv4)
if($local.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){throw 'IPv4 required'}
$udp=[Net.Sockets.UdpClient]::new([Net.Sockets.AddressFamily]::InterNetwork)
$counts=@{};$bytes=0;$received=0;$opened=$null;$failure=$null
try {
 $udp.Client.SetSocketOption([Net.Sockets.SocketOptionLevel]::Socket,[Net.Sockets.SocketOptionName]::ReuseAddress,$true)
 $udp.Client.Bind([Net.IPEndPoint]::new([Net.IPAddress]::Any,3702))
 $udp.JoinMulticastGroup([Net.IPAddress]::Parse('239.255.255.250'),$local)
 $udp.Client.ReceiveTimeout=250
 $opened=[DateTime]::UtcNow;$deadline=$opened.AddSeconds($Seconds)
 while([DateTime]::UtcNow -lt $deadline){
  $remote=[Net.IPEndPoint]::new([Net.IPAddress]::Any,0)
  try {$packet=$udp.Receive([ref]$remote);$received++;$bytes+=$packet.Length;$source=$remote.Address.ToString();if($counts.ContainsKey($source)){$counts[$source]++}elseif($counts.Count -lt 16){$counts[$source]=1}}
  catch [Net.Sockets.SocketException] {if($_.Exception.SocketErrorCode -ne [Net.Sockets.SocketError]::TimedOut){throw}}
 }
}catch{$failure='NATIVE_SOCKET_ERROR'}finally{$udp.Dispose()}
[pscustomobject]@{receiver='DOTNET_UDPCLIENT';provenance='SUPPORT_DIAGNOSTIC';pid=$PID;interfaceIPv4=$InterfaceIPv4;bind='0.0.0.0:3702';membership='239.255.255.250';windowOpenedAt=$(if($opened){$opened.ToString('o')});windowClosedAt=[DateTime]::UtcNow.ToString('o');datagramsReceived=$received;totalBytes=$bytes;sourceCounts=$counts;error=$failure}|ConvertTo-Json -Depth 4
