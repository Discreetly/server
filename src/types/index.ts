import { RoomI } from 'discreetly-interfaces';

export interface CodeStatus {
  claimed: boolean;
  roomIds: string[];
}

export interface RoomsFromClaimCode {
  roomIds: string[];
}

export interface RoomWithSecretsI extends RoomI {
  bandadaAPIKey: string;
}

export interface ClaimCodeI {
  roomIds: string[];
  expiresAt: number;
  usesLeft: number;
}

export interface GateWayIdentityI {
  semaphoreIdentity: string;
  discordId: string;
  steamId64: string;
  roomIds: string[];
  usedClaimCodes: string[];
}

export type userCountI = Record<string, number>;
