import { Device, OnvifCustomConfig, OnvifVideoStreamProfile, OnvifImagingSettings, OnvifPtzCapabilities } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { normalizeIPv4 } from '../../shared/address_validation.ts';

const discoveryNamespaces = ['http://schemas.xmlsoap.org/ws/2005/04/discovery', 'http://docs.oasis-open.org/ws-dd/ns/discovery/2009/01'];
function validHello(xml: string): boolean {
  const document = new XMLParser({ ignoreAttributes:false, processEntities:false }).parse(xml);
  const child = (parent: any, name: string, namespaces: string[], inherited: Record<string,string> = {}): {node:any; ns:Record<string,string>} | null => {
    const keys = Object.keys(parent || {}).filter(key => !key.startsWith('@_') && key.split(':').at(-1) === name);
    if (keys.length !== 1 || Array.isArray(parent[keys[0]])) return null;
    const key = keys[0], node = parent[key], ns = {...inherited};
    for (const [attribute, uri] of Object.entries(node || {})) if (attribute === '@_xmlns' || attribute.startsWith('@_xmlns:')) ns[attribute === '@_xmlns' ? '' : attribute.slice(8)] = String(uri);
    const prefix = key.includes(':') ? key.split(':')[0] : '';
    return namespaces.includes(ns[prefix]) ? { node, ns } : null;
  };
  const soap = ['http://www.w3.org/2003/05/soap-envelope', 'http://schemas.xmlsoap.org/soap/envelope/'];
  const addressing = ['http://schemas.xmlsoap.org/ws/2004/08/addressing','http://www.w3.org/2005/08/addressing'];
  const envelope = child(document,'Envelope',soap);
  const body = envelope && child(envelope.node,'Body',soap,envelope.ns);
  const hello = body && child(body.node,'Hello',discoveryNamespaces,body.ns);
  const endpoint = hello && child(hello.node,'EndpointReference',addressing,hello.ns);
  const address = endpoint && child(endpoint.node,'Address',addressing,endpoint.ns);
  const scopes = hello && child(hello.node,'Scopes',discoveryNamespaces,hello.ns);
  const text = (node:any) => typeof node === 'string' ? node : String(node?.['#text'] || '');
  if (!address || !/^urn:uuid:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(text(address.node).trim()) || !scopes || !/onvif:\/\/www\.onvif\.org\//i.test(text(scopes.node))) return false;
  const header = envelope && child(envelope.node,'Header',soap,envelope.ns);
  const action = header && child(header.node,'Action',addressing,header.ns);
  return !action || discoveryNamespaces.some(namespace => text(action.node).trim() === `${namespace}/Hello`);
}

export interface OnvifProbeMatch {
  endpointUuid?: string;
  xAddrs: string[];
  scopes: string[];
  senderIp: string;
  macAddress: string | null;
  serialNumber?: string;
  vendor?: string;
  model?: string;
}

export class OnvifDriver {
  /**
   * Generates standard WS-Discovery SOAP XML Multicast Probe (UDP 3702, 239.255.255.250)
   */
  public static createProbeEnvelope(messageId: string = crypto.randomUUID()): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
               xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
               xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <soap:Header>
    <wsa:MessageID>urn:uuid:${messageId}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </soap:Header>
  <soap:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Generates default ONVIF Profile S/T configuration for any discovered camera
   */
  public static createDefaultOnvifConfig(ip: string): OnvifCustomConfig {
    const mainProfile: OnvifVideoStreamProfile = {
      name: 'MainStream (Profile_S_01)',
      token: 'Profile_Token_01',
      codec: 'H.265',
      resolution: '3840x2160 (4K)',
      framerate: 30,
      bitrateKbps: 8192,
      bitrateMode: 'VBR',
      rtspUri: `rtsp://${ip}:554/Streaming/Channels/101`,
    };

    const subProfile: OnvifVideoStreamProfile = {
      name: 'SubStream (Profile_S_02)',
      token: 'Profile_Token_02',
      codec: 'H.264',
      resolution: '1280x720 (720p)',
      framerate: 15,
      bitrateKbps: 1024,
      bitrateMode: 'CBR',
      rtspUri: `rtsp://${ip}:554/Streaming/Channels/102`,
    };

    const imaging: OnvifImagingSettings = {
      wdrEnabled: true,
      wdrLevel: 80,
      dayNightMode: 'AUTO',
      backlightCompensation: true,
      exposureCompensation: 0,
      irCutFilter: true,
    };

    const ptz: OnvifPtzCapabilities = {
      supportsPanTilt: true,
      supportsZoom: true,
      panSpeed: 5,
      tiltSpeed: 5,
      zoomSpeed: 3,
      presets: [
        { id: 1, name: 'Main Entrance Gate', token: 'PresetToken_1' },
        { id: 2, name: 'Loading Bay Perimeter', token: 'PresetToken_2' },
        { id: 3, name: 'Staff Parking Area', token: 'PresetToken_3' },
      ],
    };

    return {
      videoProfiles: [mainProfile, subProfile],
      imaging,
      ptz,
      ntpServer: 'pool.ntp.org',
      timezone: 'UTC-04:00 (Eastern Time)',
      wsSecurityMode: 'DIGEST',
      httpsMandatory: true,
    };
  }

  /**
   * Generates ONVIF SOAP envelope for setting Video Encoder Configuration (Profile S/T)
   */
  public static createSetVideoEncoderEnvelope(profile: OnvifVideoStreamProfile): string {
    const [width, height] = profile.resolution.split(' ')[0].split('x');
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
               xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <trt:SetVideoEncoderConfiguration>
      <trt:Configuration token="${profile.token}">
        <tt:Encoding>${profile.codec}</tt:Encoding>
        <tt:Resolution>
          <tt:Width>${width}</tt:Width>
          <tt:Height>${height}</tt:Height>
        </tt:Resolution>
        <tt:RateControl>
          <tt:FrameRateLimit>${profile.framerate}</tt:FrameRateLimit>
          <tt:BitrateLimit>${profile.bitrateKbps}</tt:BitrateLimit>
        </tt:RateControl>
      </trt:Configuration>
      <trt:ForcePersistence>true</trt:ForcePersistence>
    </trt:SetVideoEncoderConfiguration>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Generates ONVIF ContinuousMove PTZ SOAP Envelope
   */
  public static createPtzContinuousMoveEnvelope(pan: number, tilt: number, zoom: number): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
               xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>Profile_Token_01</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${pan}" y="${tilt}" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
        <tt:Zoom x="${zoom}" space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Parses ONVIF WS-Discovery ProbeMatch responses and extracts MAC, Model, Hardware XAddr
   */
  public static parseProbeMatch(xmlPayload: string, senderIp: string): Partial<Device> | null {
    return this.parseDiscoveryMessage(xmlPayload, senderIp, false);
  }

  public static parseHello(xmlPayload: string, senderIp: string): Partial<Device> | null {
    return this.parseDiscoveryMessage(xmlPayload, senderIp, true);
  }

  private static parseDiscoveryMessage(xmlPayload: string, senderIp: string, hello: boolean): Partial<Device> | null {
    try {
      if (!normalizeIPv4(senderIp) || xmlPayload.length > 65507 || /<!DOCTYPE|<!ENTITY/i.test(xmlPayload) || XMLValidator.validate(xmlPayload) !== true) return null;
      if (hello) {
        if (!validHello(xmlPayload)) return null;
      } else if (!/<(?:\w+:)?ProbeMatch\b/i.test(xmlPayload)) return null;

      const endpoint = xmlPayload.match(/<(?:\w+:)?EndpointReference(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?EndpointReference>/i)?.[1] || '';
      const epMatch = endpoint.match(/<(?:\w+:)?Address(?:\s[^>]*)?>\s*urn:uuid:([a-fA-F0-9-]+)\s*<\/(?:\w+:)?Address>/i);
      const endpointUuid = epMatch?.[1]?.toLowerCase();
      
      const xAddrMatch = xmlPayload.match(/<(?:\w+:)?XAddrs(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?XAddrs>/i);
      const xAddrs = xAddrMatch ? xAddrMatch[1].trim().split(/\s+/).filter(Boolean) : [];
      const xAddr = xAddrs[0];

      const scopesMatch = xmlPayload.match(/<(?:\w+:)?Scopes(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?Scopes>/i);
      const scopesStr = scopesMatch ? scopesMatch[1] : '';
      const scopes = scopesStr.split(/\s+/).filter(Boolean);

      if (!endpointUuid && xAddrs.length === 0) return null;
      
      let hardware: string | undefined;
      let serialNumber: string | undefined;
      let mac: string | null = null;
      let vendor: string | undefined;

      if (scopesStr) {
        const hardwareMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/hardware\/([^\s]+)/i);
        if (hardwareMatch) hardware = decodeURIComponent(hardwareMatch[1]);

        const macMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/MAC\/([a-fA-F0-9:%-]+)/i);
        if (macMatch) {
          const candidate = decodeURIComponent(macMatch[1]).replace(/-/g, ':').toLowerCase();
          if (/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(candidate)) mac = candidate;
        }

        const serialMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/(?:serial|serialnumber)\/([^\s]+)/i);
        if (serialMatch) serialNumber = decodeURIComponent(serialMatch[1]);

        const nameMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/name\/([^\s]+)/i);
        if (nameMatch) {
          const rawName = decodeURIComponent(nameMatch[1]);
          if (rawName.toLowerCase().includes('axis')) vendor = 'Axis Communications';
          else if (rawName.toLowerCase().includes('illustra')) vendor = 'Illustra / Tyco';
          else if (rawName.toLowerCase().includes('lenel')) vendor = 'Lenel Access Control';
          else if (rawName.toLowerCase().includes('hanwha')) vendor = 'Hanwha Vision';
          else if (rawName.toLowerCase().includes('hikvision')) vendor = 'Hikvision Digital Technology';
          else if (rawName.toLowerCase().includes('dahua')) vendor = 'Dahua Technology';
        }
      }

      if (!vendor && mac) {
        vendor = appStateDb.resolveVendor(mac);
      }

      let port = 0;
      if (xAddr) {
        try {
          const parsedUrl = new URL(xAddr);
          port = parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80;
        } catch {
          // Keep an unknown port for malformed advertised URLs.
        }
      }

      const id = mac
        ? `mac:${mac}`
        : endpointUuid
          ? `onvif:${endpointUuid}`
          : `session:${senderIp}:${encodeURIComponent(xAddr || '')}`;

      return {
        id,
        anchor: {
          macAddress: mac,
          onvifEndpointUuid: endpointUuid,
          serialNumber,
          vendor: vendor || 'Unknown ONVIF Device',
          model: hardware,
        },
        network: {
          ipAddress: senderIp,
          subnetMask: null,
          port,
          protocol: 'ONVIF',
          xAddr,
          xAddrs,
          senderIp,
        },
        status: 'DISCOVERED',
        statusMessage: hello ? 'Observed an ONVIF WS-Discovery Hello announcement; unicast communication is not verified.' : 'Responded to ONVIF WS-Discovery',
        discoveredPhase: 3,
      };
    } catch (err) {
      console.error('Error parsing ONVIF ProbeMatch:', err);
      return null;
    }
  }
}
