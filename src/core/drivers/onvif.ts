import { Device, ProtocolType } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';

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
   * Parses ONVIF WS-Discovery ProbeMatch responses and extracts MAC, Model, Hardware XAddr
   */
  public static parseProbeMatch(xmlPayload: string, senderIp: string): Partial<Device> | null {
    try {
      // Extract EndpointReference (UUID or MAC urn)
      const epMatch = xmlPayload.match(/<(?:\w+:)?Address>urn:uuid:([a-fA-F0-9-]+)<\/(?:\w+:)?Address>/i) ||
                      xmlPayload.match(/urn:uuid:([a-fA-F0-9-]+)/i);
      
      // Extract XAddrs
      const xAddrMatch = xmlPayload.match(/<(?:\w+:)?XAddrs>(.*?)<\/(?:\w+:)?XAddrs>/i);
      const xAddr = xAddrMatch ? xAddrMatch[1].trim().split(' ')[0] : `http://${senderIp}:80/onvif/device_service`;

      // Extract Scopes for Hardware/Name/Location
      const scopesMatch = xmlPayload.match(/<(?:\w+:)?Scopes>(.*?)<\/(?:\w+:)?Scopes>/i);
      const scopesStr = scopesMatch ? scopesMatch[1] : '';
      
      let hardware = 'ONVIF IP Camera';
      let mac = '';
      let vendor = 'Generic ONVIF';

      if (scopesStr) {
        const hardwareMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/hardware\/([^\s]+)/i);
        if (hardwareMatch) hardware = decodeURIComponent(hardwareMatch[1]);

        const macMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/MAC\/([a-fA-F0-9:]+)/i);
        if (macMatch) mac = macMatch[1].toLowerCase();

        const nameMatch = scopesStr.match(/onvif:\/\/www\.onvif\.org\/name\/([^\s]+)/i);
        if (nameMatch) {
          const rawName = decodeURIComponent(nameMatch[1]);
          if (rawName.toLowerCase().includes('axis')) vendor = 'Axis Communications';
          else if (rawName.toLowerCase().includes('illustra')) vendor = 'Illustra / Tyco';
          else if (rawName.toLowerCase().includes('lenel')) vendor = 'Lenel Access Control';
        }
      }

      // If MAC not in scopes, fallback to mock/discovered anchor
      if (!mac) {
        mac = `00:40:8c:${senderIp.split('.').slice(2).map(n => parseInt(n).toString(16).padStart(2, '0')).join(':')}:01`;
      }

      if (vendor === 'Generic ONVIF') {
        vendor = appStateDb.resolveVendor(mac);
      }

      return {
        anchor: {
          macAddress: mac,
          serialNumber: epMatch ? epMatch[1].slice(0, 12).toUpperCase() : undefined,
          vendor,
          model: hardware,
        },
        network: {
          ipAddress: senderIp,
          subnetMask: '255.255.255.0',
          port: 80,
          protocol: 'ONVIF',
          xAddr,
        },
        status: 'DISCOVERED',
      };
    } catch (err) {
      console.error('Error parsing ONVIF ProbeMatch:', err);
      return null;
    }
  }
}
