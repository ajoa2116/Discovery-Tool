import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function observeWindowsReceive(interfaceIndex:number):Promise<unknown>{
 if(!Number.isInteger(interfaceIndex)||interfaceIndex<1)return Promise.reject(Error('INVALID_ADAPTER'));
 const script=fileURLToPath(new URL('../../../scripts/observe-windows-receive.ps1',import.meta.url));
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-InterfaceIndex',String(interfaceIndex),'-BackendExecutable',process.execPath],{windowsHide:true,timeout:15000,maxBuffer:131072},(error,stdout)=>{if(error)return reject(Error('WINDOWS_OBSERVATION_UNAVAILABLE'));try{resolve(JSON.parse(stdout));}catch{reject(Error('WINDOWS_OBSERVATION_UNAVAILABLE'));}}));
}
