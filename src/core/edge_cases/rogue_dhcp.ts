import { RogueDHCPOffer } from '../../types/index.ts';
import { appStateDb } from '../storage/app_db.ts';
import { projectDb } from '../storage/project_db.ts';

export class RogueDHCPAuditor {
  /**
   * Section 13.3: Rogue DHCP Server Conflicts & Isolation Protocols
   * Audits incoming DHCP Offer/ACK packets to flag unauthorized DHCP servers on isolated camera networks.
   */
  public static inspectDHCPOffer(offer: RogueDHCPOffer): { isRogue: boolean; recommendation: string } {
    const isAuthorized = appStateDb.isDHCPServerAuthorized(offer.serverIp);
    offer.isAuthorized = isAuthorized;

    if (!isAuthorized) {
      projectDb.recordRogueDhcp(offer);

      appStateDb.logAudit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category: 'SECURITY',
        level: 'ERROR',
        message: `Unapproved DHCP offer observed from ${offer.serverIp} (${offer.serverMac}) for ${offer.offeredIp}.`,
        details: offer,
      });

      return {
        isRogue: true,
        recommendation: `Review the DHCP server at ${offer.serverIp} and isolate the affected test network segment if the offer is unexpected. No switch-port location has been inferred.`,
      };
    }

    return {
      isRogue: false,
      recommendation: `Authorized DHCP server ${offer.serverIp} acknowledged.`,
    };
  }
}
