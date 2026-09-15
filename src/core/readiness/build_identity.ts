import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export interface BuildIdentity {version:string;commit:string|null;dirty:boolean|null;sourceDigest:string|null;runtimeMode:string}
export function readBuildIdentity(manifest=fileURLToPath(new URL('../../../dist/build-info.json',import.meta.url))):BuildIdentity {
  const version=JSON.parse(readFileSync(new URL('../../../package.json',import.meta.url),'utf8')).version as string;
  const unknown={version,commit:null,dirty:null,sourceDigest:null,runtimeMode:process.env.NODE_ENV==='production'?'production':'development'};
  try{const value=JSON.parse(readFileSync(manifest,'utf8'));if(value.version!==version||! /^[a-f0-9]{64}$/.test(value.sourceDigest)||!(value.commit===null||/^[a-f0-9]{40}$/.test(value.commit))||!(value.dirty===null||typeof value.dirty==='boolean'))return unknown;return {...unknown,commit:value.commit,dirty:value.dirty,sourceDigest:value.sourceDigest};}catch{return unknown;}
}
