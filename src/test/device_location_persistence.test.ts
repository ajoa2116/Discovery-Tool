import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import net from 'node:net';
import dgram from 'node:dgram';
import type { Device } from '../types/index.ts';

// Actual metadata boundary -> explicit disk save -> fresh store. No HTTP/backend.
const scenarios=[{name:'ordinary',value:'North entrance'},{name:'empty',value:''},{name:'whitespace',value:'  North Door  '}];
const allowedNames=new Set(scenarios.flatMap(s=>[`${s.name}-a.cctvproj`,`${s.name}-b.cctvproj`]));
let root='',parent='',identity:Awaited<ReturnType<typeof directoryIdentity>>|undefined;
let checks=0,completed=0,saves=0,reopens=0,removed=0,cleanupConfirmed=false;
const violations:string[]=[];
const networkOriginal={connect:net.Socket.prototype.connect,listen:net.Server.prototype.listen,udp:dgram.createSocket};
const deny=(operation:string)=>{violations.push(operation);throw Error('Forbidden test network operation: '+operation);};

async function directoryIdentity(path:string){return fs.lstat(path,{bigint:true});}
async function noRedirect(path:string){
  const absolute=resolve(path);
  for(let cursor=absolute;;cursor=dirname(cursor)){
    assert.equal((await fs.lstat(cursor)).isSymbolicLink(),false,'No symlink/junction: '+cursor);
    if(dirname(cursor)===cursor)break;
  }
  assert.equal(await fs.realpath(absolute),absolute,'Canonical path must not redirect');
}
async function ownRoot(){
  assert.ok(root&&identity&&parent);assert.equal(dirname(root),parent);
  assert.match(basename(root),/^discovery-location-disk-[A-Za-z0-9]+$/);
  await noRedirect(root);
  const current=await directoryIdentity(root);
  assert.ok(current.isDirectory());assert.equal(current.dev,identity.dev);assert.equal(current.ino,identity.ino);assert.equal(current.birthtimeNs,identity.birthtimeNs);
}
async function ownedFile(name:string,mustExist:boolean){
  await ownRoot();assert.ok(allowedNames.has(name));
  const file=resolve(root,name),inside=relative(root,file);
  assert.ok(inside&&!isAbsolute(inside)&&inside!=='..'&&!inside.startsWith('..'+sep));assert.equal(dirname(file),root);
  if(mustExist){await noRedirect(file);const stat=await fs.lstat(file);assert.ok(stat.isFile());assert.equal(stat.nlink,1);}
  else assert.equal(await fs.lstat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}),false,'Fresh file required');
  return file;
}
function check(name:string,run:()=>void){run();checks++;console.log('PASS '+name);}
const camera=(id:string,mac:string,location:string):Device=>({
  id,anchor:{macAddress:mac,onvifEndpointUuid:'uuid-'+mac,serialNumber:'serial-'+mac,vendor:'Synthetic fixture',model:'Fixture camera'},
  network:{ipAddress:'192.0.2.50',subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.40','192.0.2.50']},
  technician:{name:'Fixture '+id,location,notes:'Retain notes'},configuredState:{inferred:false,manualOverride:true},
  status:'ONLINE',sessionVerification:'VERIFIED',evidenceProvenance:'SYNTHETIC_TEST',
  reachability:{lastSuccessfulResponseAt:'2026-10-28T12:00:00Z'},
  discoveredPhase:3,firstSeenAt:'2026-10-28T12:00:00Z',lastSeenAt:'2026-10-28T12:00:00Z'
});

async function run(){
  let failure:unknown;
  try{
    assert.equal(process.platform,'win32','Reviewed Windows fixture');
    // This parent was also checked for Windows ReparsePoint attributes before execution.
    parent=resolve(tmpdir());await noRedirect(parent);
    root=await fs.mkdtemp(join(parent,'discovery-location-disk-'));
    identity=await directoryIdentity(root);await ownRoot();
    console.log(JSON.stringify({fixtureRoot:root,network:'denied',backendConstructed:false}));
    net.Socket.prototype.connect=function(){return deny('Socket.connect');} as typeof net.Socket.prototype.connect;
    net.Server.prototype.listen=function(){return deny('Server.listen');} as typeof net.Server.prototype.listen;
    dgram.createSocket=function(){return deny('dgram.createSocket');} as typeof dgram.createSocket;
    const {SiteProjectDatabase,ProjectValidationError}=await import('../core/storage/project_db.ts');
    const {LegacyConfigurationBoundary}=await import('../core/network/legacy_configuration_boundary.ts');
    const freshOpen=async(file:string)=>{await ownedFile(basename(file),true);const db=new SiteProjectDatabase('ISOLATED_TEST');await db.openProject(file);reopens++;return db;};
    for(const scenario of scenarios){
      const label=scenario.name;
      const db=new SiteProjectDatabase('ISOLATED_TEST');
      const projectA=db.createNewProject('Fixture A '+label);projectA.technicianName='Synthetic technician';const projectAId=projectA.id;
      db.upsertDevice(camera('camera/shared','00:11:22:33:44:50','Seed location'));
      db.upsertDevice(camera('camera/neighbor','00:11:22:33:44:52','Garage'));
      const boundary=new LegacyConfigurationBoundary(db);
      const a=await ownedFile(label+'-a.cctvproj',false);await db.saveAs(a);saves++;await ownedFile(basename(a),true);
      const originalBytes=await fs.readFile(a,'utf8'),originalTarget=structuredClone(db.getDeviceById('camera/shared')!),originalNeighbor=structuredClone(db.getDeviceById('camera/neighbor')!);
      check(label+': baseline explicit file is clean and identities are distinct',()=>{
        assert.equal(db.getSession().dirty,false);assert.equal(db.getDevices().length,2);
        assert.equal(originalTarget.network.ipAddress,originalNeighbor.network.ipAddress);assert.notDeepEqual(originalTarget.anchor,originalNeighbor.anchor);
      });
      const changed=boundary.updateLocalMetadata('camera/shared',{technician:{location:scenario.value}});
      check(label+': real boundary changes only exact selected location in memory',()=>{
        assert.equal(changed.id,'camera/shared');assert.equal(changed.technician?.location,scenario.value);assert.equal(db.getSession().dirty,true);
        const normalized=structuredClone(changed);normalized.technician!.location=originalTarget.technician!.location;
        assert.deepEqual(normalized,originalTarget);assert.deepEqual(db.getDeviceById('camera/neighbor'),originalNeighbor);
      });
      const afterMemoryBytes=await fs.readFile(a,'utf8');
      check(label+': memory update does not write saved file',()=>assert.equal(afterMemoryBytes,originalBytes));
      for(const invalid of [{name:'unknown identity',id:'unknown-fixture-id',body:{technician:{location:'Wrong'}}},{name:'non-string location',id:'camera/shared',body:{technician:{location:123}}}]){
        const before=JSON.stringify(db.getSession()),disk=await fs.readFile(a,'utf8');
        check(label+': '+invalid.name+' rejects without memory mutation',()=>{
          assert.throws(()=>boundary.updateLocalMetadata(invalid.id,invalid.body),error=>error instanceof ProjectValidationError&&error.message.includes(invalid.name==='unknown identity'?'Device not found':'location must be text'));
          assert.equal(JSON.stringify(db.getSession()),before);
        });
        const diskAfter=await fs.readFile(a,'utf8');
        check(label+': '+invalid.name+' leaves disk byte-identical',()=>assert.equal(diskAfter,disk));
      }
      await ownedFile(basename(a),true);await db.saveProject();saves++;await ownedFile(basename(a),true);
      const savedA=await fs.readFile(a,'utf8'),bundleA=JSON.parse(savedA);
      check(label+': explicit save contains exact location and unchanged neighbor',()=>{
        assert.notEqual(savedA,originalBytes);assert.equal(db.getSession().dirty,false);
        assert.equal(bundleA.project.devices.find((d:Device)=>d.id==='camera/shared').technician.location,scenario.value);
        assert.equal(bundleA.project.devices.find((d:Device)=>d.id==='camera/neighbor').technician.location,'Garage');
      });
      const reopenedA=await freshOpen(a),loaded=reopenedA.getDeviceById('camera/shared')!;
      check(label+': fresh store preserves both identities and technician values',()=>{
        assert.equal(reopenedA.getProject().id,projectAId);assert.equal(reopenedA.getDevices().length,2);assert.equal(loaded.technician?.location,scenario.value);
        assert.deepEqual(loaded.anchor,originalTarget.anchor);assert.deepEqual(loaded.network,originalTarget.network);
        assert.equal(loaded.technician?.name,originalTarget.technician?.name);assert.equal(loaded.technician?.notes,originalTarget.technician?.notes);
        assert.deepEqual(loaded.configuredState,originalTarget.configuredState);assert.equal(reopenedA.getDeviceById('camera/neighbor')?.technician?.location,'Garage');
      });
      check(label+': reopen does not fabricate live evidence',()=>{
        for(const d of reopenedA.getDevices()){
          assert.equal(d.status,'UNKNOWN');assert.equal(d.savedStatusSnapshot,'ONLINE');assert.equal(d.sessionVerification,'NOT_VERIFIED');
          assert.equal(d.evidenceProvenance,'SYNTHETIC_TEST');assert.equal(d.reachability,undefined);assert.equal(d.diagnostics,undefined);assert.equal(d.telemetry,undefined);
        }
        assert.equal(reopenedA.listProjectHistory('DEVICE','camera/shared').filter(e=>e.type==='LOCATION_CHANGED').length,1);
      });
      // Same boundary/store, now a different Project with a deliberately reused ID.
      const projectB=db.createNewProject('Fixture B '+label);projectB.technicianName='Synthetic technician';const projectBId=projectB.id;
      db.upsertDevice(camera('camera/shared','00:11:22:33:44:60','Project B original'));
      const b=await ownedFile(label+'-b.cctvproj',false);await db.saveAs(b);saves++;await ownedFile(basename(b),true);
      const originalB=await fs.readFile(b,'utf8');boundary.updateLocalMetadata('camera/shared',{technician:{location:'Project B separate'}});
      const aBeforeBSave=await fs.readFile(a,'utf8'),bBeforeBSave=await fs.readFile(b,'utf8');
      check(label+': current Project B owns reused ID without writing either file',()=>{
        assert.notEqual(projectAId,projectBId);assert.equal(db.getDeviceById('camera/shared')?.anchor.macAddress,'00:11:22:33:44:60');
        assert.equal(aBeforeBSave,savedA);assert.equal(bBeforeBSave,originalB);
      });
      await ownedFile(basename(b),true);await db.saveProject();saves++;await ownedFile(basename(b),true);
      const finalABytes=await fs.readFile(a,'utf8'),finalBBytes=await fs.readFile(b,'utf8');
      const freshA=await freshOpen(a),freshB=await freshOpen(b);
      check(label+': separate files reopen without project/device mixing',()=>{
        assert.equal(finalABytes,savedA);assert.notEqual(finalBBytes,originalB);
        assert.equal(freshA.getProject().id,projectAId);assert.equal(freshB.getProject().id,projectBId);
        assert.equal(freshA.getDevices().length,2);assert.equal(freshB.getDevices().length,1);
        assert.equal(freshA.getDeviceById('camera/shared')?.technician?.location,scenario.value);assert.equal(freshB.getDeviceById('camera/shared')?.technician?.location,'Project B separate');
        assert.notDeepEqual(freshA.getDeviceById('camera/shared')?.anchor,freshB.getDeviceById('camera/shared')?.anchor);
        assert.equal(freshB.getDeviceById('camera/shared')?.status,'UNKNOWN');assert.equal(freshB.getDeviceById('camera/shared')?.sessionVerification,'NOT_VERIFIED');
      });
      assert.deepEqual(violations,[]);completed++;console.log('SCENARIO PASS '+label+' '+JSON.stringify(scenario.value));
    }
    assert.deepEqual((await fs.readdir(root)).sort(),[...allowedNames].sort(),'Only six expected project files remain');
  }catch(error){failure=error;console.error(error);}
  finally{
    net.Socket.prototype.connect=networkOriginal.connect;net.Server.prototype.listen=networkOriginal.listen;dgram.createSocket=networkOriginal.udp;
    try{
      if(root){
        await ownRoot();const entries=await fs.readdir(root);const files=[];
        // Verify the complete set before any deletion; never recursively remove an ambiguous root.
        for(const entry of entries)files.push(await ownedFile(entry,true));
        for(const file of files){await ownedFile(basename(file),true);await fs.unlink(file);removed++;}
        await ownRoot();await fs.rmdir(root);
        assert.equal(await fs.lstat(root).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}),false);
      }
      cleanupConfirmed=true;
    }catch(error){failure??=error;console.error('CLEANUP UNCERTAIN; preserve '+root,error);}
  }
  console.log(JSON.stringify({scenariosPassed:completed,scenariosFailed:failure?1:0,scenariosUnrun:Math.max(0,scenarios.length-completed-(failure?1:0)),checksPassed:checks,explicitSaves:saves,freshStoreReopens:reopens,networkAttempts:violations,fixtureRoot:root,removedFiles:removed,cleanupConfirmed}));
  if(failure||completed!==scenarios.length||!cleanupConfirmed||violations.length)process.exitCode=1;
}
void run();
