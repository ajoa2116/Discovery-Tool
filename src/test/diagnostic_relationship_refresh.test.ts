import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import dgram from 'node:dgram';
import type { Device, DiagnosticCheckEvidence, WindowsAdapterSnapshot } from '../types/index.ts';
import type { DiagnosticNetworkRelationship } from '../core/storage/project_db.ts';

// Guards precede storage/diagnostic imports. All stores and providers are inert.
let networkAttempts = 0;
const original = { connect: net.Socket.prototype.connect, listen: net.Server.prototype.listen, udp: dgram.createSocket, fetch: globalThis.fetch };
const deny = (): never => { networkAttempts++; throw Error('Forbidden regression-test network operation'); };
net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
dgram.createSocket = deny;
globalThis.fetch = deny;

await test('accepted diagnostic relationship refresh', async t => {
  try {
    const { SiteProjectDatabase } = await import('../core/storage/project_db.ts');
    const { DeviceDiagnosticEngine } = await import('../core/engine/diagnostic_engine.ts');
    const { applyNetworkRelationship } = await import('../shared/network_relationship.ts');
    const { appStateDb } = await import('../core/storage/app_db.ts');
    const stamp = '2026-10-29T12:00:00.000Z', ip = '192.0.2.50';
    const adapter = (address:string):WindowsAdapterSnapshot => ({ interfaceIndex:7, interfaceAlias:'Synthetic Ethernet',
      mediaType:'ETHERNET', operationalStatus:'Up', eligible:true, dhcpEnabled:false,
      ipv4Addresses:[{address,prefixLength:24}], defaultGateways:[], dnsAutomatic:true, dnsServers:[], capturedAt:stamp });
    const projection = (device:Device):DiagnosticNetworkRelationship => ({
      subnetClassification:device.reachability?.subnetClassification,
      relationshipAdapter:device.reachability?.relationshipAdapter,
      pairEligibility:device.reachability?.pairEligibility,
    });
    const seed = () => {
      const db = new SiteProjectDatabase('ISOLATED_TEST'); db.createNewProject('Synthetic relationship');
      const device:Device = { id:'stable-camera', anchor:{macAddress:'00:11:22:33:44:50',onvifEndpointUuid:'uuid-50',serialNumber:'synthetic-50',vendor:'Synthetic'},
        network:{ipAddress:ip,subnetMask:'255.255.255.0',port:80,protocol:'ONVIF',ipAddressHistory:['192.0.2.40',ip]},
        technician:{name:'  Camera Name  ',location:'  North Door  ',notes:'  Keep notes  '},
        evidenceProvenance:'SYNTHETIC_TEST',status:'UNKNOWN',sessionVerification:'NOT_VERIFIED',discoveredPhase:3,firstSeenAt:stamp,lastSeenAt:stamp,
        reachability:{wsDiscoveryRespondedAt:stamp,lastSuccessfulResponseAt:stamp,discoveryInterface:{name:'Discovery NIC',ipAddress:'198.51.100.10',netmask:'255.255.255.0',interfaceIndex:7},
          discoverySource:{ipAddress:ip,port:3702,payloadBytes:100,kind:'PROBE_MATCH'},tcpServices:[{port:554,reachable:true,testedAt:stamp}]} };
      applyNetworkRelationship(device,[adapter('198.51.100.10')],[device]); db.upsertDevice(device); db.exportProjectJsonForSave();
      return db;
    };
    const engine = new DeviceDiagnosticEngine({
      ping:{async check(targetIp){return {type:'PING',targetIp,success:false,timestamp:stamp};}},
      http:{async check(targetIp,options){return {type:options.protocol==='https'?'HTTPS':'HTTP',targetIp,success:options.protocol==='http',httpStatus:options.protocol==='http'?200:undefined,timestamp:stamp};}},
      tcp:{async check(targetIp,options){return {type:'TCP',targetIp,port:options.port,success:false,timestamp:stamp};}},
    });
    const localObservation = (db:InstanceType<typeof SiteProjectDatabase>) => applyNetworkRelationship(structuredClone(db.getDevices()[0]),[adapter('192.0.2.10')],db.getDevices());

    await t.test('changed adapter produces stored LOCAL/ONLINE and current adapter/Pair values', async () => {
      const db=seed(); assert.equal(db.getDevices()[0].status,'DIFFERENT_SUBNET');
      const observed=localObservation(db), relationship=structuredClone(projection(observed));
      await engine.diagnose(observed);
      const stored=db.applyDiagnosticRefresh(observed,relationship)!;
      assert.equal(stored.status,'ONLINE'); assert.equal(stored.sessionVerification,'VERIFIED');
      assert.equal(stored.reachability?.subnetClassification,'LOCAL');
      assert.deepEqual(stored.reachability?.relationshipAdapter,{name:'Synthetic Ethernet',ipAddress:'192.0.2.10',netmask:'255.255.255.0',interfaceIndex:7});
      assert.deepEqual(stored.reachability?.pairEligibility,relationship.pairEligibility);
      assert.equal(stored.reachability?.pairEligibility?.eligible,false);
      assert.ok(stored.diagnostics?.checks.some(check=>check.success&&check.type==='HTTP'));
    });
    await t.test('unrelated observed payload cannot replace identity, metadata, network or discovery evidence', () => {
      const db=seed(), before=structuredClone(db.getDevices()[0]), observed=localObservation(db), relationship=projection(observed);
      observed.anchor={macAddress:'00:11:22:33:44:99',vendor:'Wrong'}; observed.network.port=9999; observed.network.ipAddressHistory=[];
      observed.technician={name:'Wrong',location:'Wrong',notes:'Wrong'};
      observed.reachability={subnetClassification:'UNKNOWN',wsDiscoveryRespondedAt:'wrong',discoveryInterface:undefined,tcpServices:[]};
      Object.assign(relationship,{wsDiscoveryRespondedAt:'wrong',identityObservation:{source:'wrong'}});
      const stored=db.applyDiagnosticRefresh(observed,relationship)!;
      assert.deepEqual(stored.anchor,before.anchor); assert.deepEqual(stored.network,before.network);
      assert.deepEqual(stored.technician,before.technician); assert.equal(stored.evidenceProvenance,before.evidenceProvenance);
      const withoutRelationship = (device:Device) => {
        const {subnetClassification,relationshipAdapter,pairEligibility,...discovery}=device.reachability!; return discovery;
      };
      assert.deepEqual(withoutRelationship(stored),withoutRelationship(before));
      assert.equal(stored.reachability?.subnetClassification,'LOCAL');
    });
    await t.test('stale IP rejects the entire result without mutation', () => {
      const db=seed(), observed=localObservation(db), before=JSON.stringify(db.getSession());
      observed.network.ipAddress='192.0.2.99'; observed.status='ONLINE';
      assert.equal(db.applyDiagnosticRefresh(observed,projection(observed)),undefined);
      assert.equal(JSON.stringify(db.getSession()),before);
    });
    await t.test('unknown record ID cannot admit relationship or diagnostic evidence', () => {
      const db=seed(), observed=localObservation(db), before=JSON.stringify(db.getSession()); observed.id='foreign-camera';
      assert.equal(db.applyDiagnosticRefresh(observed,projection(observed)),undefined);
      assert.equal(JSON.stringify(db.getSession()),before);
    });
    await t.test('collision status/message retain precedence over successful diagnosis', () => {
      const db=seed(), current=db.getDevices()[0]; current.status='COLLISION'; current.statusMessage='Existing collision';
      const observed=localObservation(db), relationship=projection(observed); observed.status='ONLINE'; observed.statusMessage='Wrong success';
      const stored=db.applyDiagnosticRefresh(observed,relationship)!;
      assert.equal(stored.status,'COLLISION'); assert.equal(stored.statusMessage,'Existing collision');
      assert.equal(stored.reachability?.subnetClassification,'LOCAL'); assert.equal(stored.reachability?.pairEligibility?.eligible,false);
    });
    await t.test('ordinary background result cannot overwrite topology without explicit recomputation', () => {
      const db=seed(), old=structuredClone(db.getDevices()[0]);
      db.applyDiagnosticRefresh(localObservation(db),projection(localObservation(db)));
      const before=structuredClone(db.getDevices()[0].reachability);
      db.applyDiagnosticRefresh(old); assert.deepEqual(db.getDevices()[0].reachability,before);
    });
    await t.test('fresh UNKNOWN relationship clears obsolete adapter information', () => {
      const db=seed(), observed=applyNetworkRelationship(structuredClone(db.getDevices()[0]),[],db.getDevices());
      const stored=db.applyDiagnosticRefresh(observed,projection(observed))!;
      assert.equal(stored.reachability?.subnetClassification,'UNKNOWN'); assert.equal(stored.reachability?.relationshipAdapter,undefined);
      assert.equal(stored.reachability?.pairEligibility?.eligible,false);
    });
    await t.test('refresh preserves clean/dirty state, project history, generation and audit', () => {
      for(const dirty of [false,true]) {
        const db=seed(); if(dirty)db.updateDeviceTechnicianFields('stable-camera',{notes:'Changed before refresh'});
        const before={dirty:db.getSession().dirty,history:structuredClone(db.getProject().auditLogs),updatedAt:db.getProject().updatedAt,
          context:db.getMetadataWriteContext(),audit:structuredClone(appStateDb.getAuditLogs())};
        const observed=localObservation(db); db.applyDiagnosticRefresh(observed,projection(observed));
        assert.equal(db.getSession().dirty,before.dirty); assert.deepEqual(db.getProject().auditLogs,before.history);
        assert.equal(db.getProject().updatedAt,before.updatedAt); assert.deepEqual(db.getMetadataWriteContext(),before.context);
        assert.deepEqual(appStateDb.getAuditLogs(),before.audit);
      }
    });
    await t.test('accepted relationship objects do not alias caller-owned mutable snapshots', () => {
      const db=seed(), observed=localObservation(db), relationship=projection(observed);
      const stored=db.applyDiagnosticRefresh(observed,relationship)!;
      relationship.relationshipAdapter!.ipAddress='wrong'; relationship.pairEligibility!.adapterIndexes.push(999);
      assert.equal(stored.reachability?.relationshipAdapter?.ipAddress,'192.0.2.10');
      assert.ok(!stored.reachability?.pairEligibility?.adapterIndexes.includes(999));
    });
    await t.test('no network operations attempted', () => assert.equal(networkAttempts,0));
  } finally {
    net.Socket.prototype.connect=original.connect; net.Server.prototype.listen=original.listen;
    dgram.createSocket=original.udp; globalThis.fetch=original.fetch;
  }
});
