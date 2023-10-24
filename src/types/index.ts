import { RoomI } from 'discreetly-interfaces';
import { Groth16Proof, PublicSignals } from 'snarkjs';

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
  discordId: string | null;
}

export interface GateWayIdentityI {
  semaphoreIdentity: string | null;
  roomIds: string[];
  usedClaimCodes: string[];
}

export interface SNARKProof {
  proof: Groth16Proof;
  publicSignals: PublicSignals;
}

export type userCountI = Record<string, number>;
