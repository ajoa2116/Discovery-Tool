import { execFile } from 'node:child_process';
export interface UdpPortOwner { pid:number; processName:string; localAddress:string; localPort:number }
/** Read-only, bounded observation; no process termination or policy changes. */
export function readDiscoveryPortOwners():Promise<UdpPortOwner[]> {
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; @(Get-NetUDPEndpoint | Where-Object LocalPort -eq 3702 | Select-Object -First 32 | ForEach-Object { $owner=Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{pid=$_.OwningProcess;processName=$owner.ProcessName;localAddress=$_.LocalAddress;localPort=$_.LocalPort} }) | ConvertTo-Json -Compress"],{windowsHide:true,timeout:5000,maxBuffer:32768},(error,stdout)=>{
    if(error)return reject(Error('UDP ownership observation unavailable.'));
    try {const parsed=stdout.trim()?JSON.parse(stdout):[];resolve((Array.isArray(parsed)?parsed:[parsed]).filter(v=>Number.isInteger(v.pid)&&v.localPort===3702).slice(0,32));}catch{reject(Error('UDP ownership observation unavailable.'));}
  }));
}
