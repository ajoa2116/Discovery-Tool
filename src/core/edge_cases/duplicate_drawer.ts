export interface ResolutionAction {
  macAddress: string;
  newIp: string;
  newSubnet: string;
  newGateway: string;
}

export class DuplicateAssistantDrawer {
  /** @deprecated Unsafe prototype retained only as a compatibility boundary. */
  public static resolveCollision(_collidingIp: string, _resolutions: ResolutionAction[]): { success: boolean; message: string } {
    return { success: false, message: 'Unsafe in-memory resolution was removed. Use DuplicateRemediationService preview, confirmation, write, and verification.' };
  }
}
