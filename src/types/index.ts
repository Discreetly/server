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

export interface GatewayDataI {
  idc: string;
}

export interface GatewayInviteDataI extends GatewayDataI {
  code: string;
}

export interface GatewaySignatureDataI {
  message: string;
  signature: string;
}

export interface GatewayProofDataI extends GatewayDataI {
  proof: SNARKProof;
}

export interface addRoomData {
  roomName: string;
  rateLimit: number;
  userMessageLimit: number;
  numClaimCodes?: number;
  approxNumMockUsers?: number;
  adminIdentities?: string[];
  roomType?: string;
  bandadaAddress?: string;
  bandadaAPIKey?: string;
  bandadaGroupId?: string;
  membershipType?: string;
  roomId?: string;
  admin?: boolean;
  discordIds?: string[];
}

export interface Jubmojis {
  jubmoji: any[];
}
