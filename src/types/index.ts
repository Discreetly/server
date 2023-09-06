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

export type userCountI = Record<string, number>;
