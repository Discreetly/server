/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import snarkjs from 'snarkjs';
import { EdwardsPoint, WeierstrassPoint } from './babyJubjub';
import { computeTUFromR } from './ecdsa';
import { computeMerkleRoot } from './inputGen';
import { VerificationResult, VerifyArgs, ZKP, ZKPPublicSignals } from './jubmoji.types';
import { deserializeMembershipProof, hexToBigInt } from './utils';
import vkey from './vkey';
import { cardPubKeys } from './pubkeys';
import { findAllJubmojiNullifiers } from '../../data/db';

export async function jubmojiVerifier(serializedMembershipProof): Promise<VerificationResult> {
  const merkleRoot = await getMerkleRootFromCache(collectionPubKeys);

  return await verifyMembership({
    proof: deserializeMembershipProof(serializedMembershipProof),
    merkleRoot,
    sigNullifierRandomness: hexToBigInt(
      '6addd8ed78c6fb64157aa768c5a9477db536172929949dc22274e323ccb9'
    )
  });
}

const collectionPubKeys = cardPubKeys.map((card) => card.pubKeyJub);

const verifyMembership = async ({
  proof,
  merkleRoot,
  merkleRootArgs,
  sigNullifierRandomness
}: VerifyArgs): Promise<VerificationResult> => {
  if (!merkleRoot && !merkleRootArgs) {
    throw new Error('Must provide either merkle root or merkle root args!');
  }

  const publicSignals = getPublicSignalsFromMembershipZKP(proof.zkp);

  let resolvedMerkleRoot;
  if (merkleRoot) {
    resolvedMerkleRoot = merkleRoot;
  } else {
    const { pubKeys } = merkleRootArgs!;
    const edwardsPubKeys = pubKeys.map((pubKey) => pubKey.toEdwards());
    resolvedMerkleRoot = await computeMerkleRoot(edwardsPubKeys);
  }
  if (resolvedMerkleRoot !== publicSignals.merkleRoot) {
    return { verified: false };
  }
  const { T, U } = computeTUFromR(proof.R, proof.msgHash);
  if (!T.equals(publicSignals.T) || !U.equals(publicSignals.U)) {
    return { verified: false };
  }
  if (sigNullifierRandomness !== publicSignals.sigNullifierRandomness) {
    return { verified: false };
  }
  // TODO! This is where we need to check and make sure someone can't join more than once

  const usedSigNullifiers: string[] = await findAllJubmojiNullifiers();

  if (usedSigNullifiers && usedSigNullifiers.includes(String(publicSignals.sigNullifier))) {
    return { verified: false };
  }
  const verified = await verifyMembershipZKP(vkey, proof.zkp);
  if (!verified) {
    return { verified: false };
  }

  return {
    verified: true,
    consumedSigNullifiers: [publicSignals.sigNullifier]
  };
};

/**
 * Gets public signals as typed arguments from a membership zkp
 * @param zkp - The membership zkp
 * @returns - Public signals of the membership zkp
 */
const getPublicSignalsFromMembershipZKP = (zkp: ZKP): ZKPPublicSignals => {
  const publicSignals = zkp.publicSignals;

  return {
    merkleRoot: BigInt(publicSignals[3]),
    T: new EdwardsPoint(BigInt(publicSignals[4]), BigInt(publicSignals[5])),
    U: new EdwardsPoint(BigInt(publicSignals[6]), BigInt(publicSignals[7])),
    sigNullifier: BigInt(publicSignals[0]),
    sigNullifierRandomness: BigInt(publicSignals[8]),
    pubKeyNullifier: BigInt(publicSignals[1]),
    pubKeyNullifierRandomnessHash: BigInt(publicSignals[2])
  };
};

const getMerkleRootFromCache = async (pubKeyList: string[]): Promise<bigint> => {
  const pubKeys = pubKeyList.map((pubKey) => publicKeyFromString(pubKey).toEdwards());

  return await computeMerkleRoot(pubKeys);
};

/**
 * Converts a public key in hex form to a WeierstrassPoint
 * Reference for key format: https://en.bitcoin.it/wiki/Elliptic_Curve_Digital_Signature_Algorithm
 * @param pubKey - The public key in hex form
 * @returns The public key in Weierstrass form
 */
const publicKeyFromString = (pubKey: string): WeierstrassPoint => {
  if (!pubKey.startsWith('04')) {
    throw new Error('Only handle uncompressed public keys for now');
  }

  const pubKeyLength = pubKey.length - 2;
  const x = hexToBigInt(pubKey.slice(2, 2 + pubKeyLength / 2));
  const y = hexToBigInt(pubKey.slice(2 + pubKeyLength / 2));

  return new WeierstrassPoint(x, y);
};

/**
 * Verifies a zero knowledge proof for a membership proof
 * @param vkey - The verification key for the membership proof
 * @param proof - The zero knowledge proof to verify
 * @param publicInputs - The public inputs to the zero knowledge proof
 * @returns - A boolean indicating whether or not the proof is valid
 */
const verifyMembershipZKP = async (vkey: any, { proof, publicSignals }: ZKP): Promise<boolean> => {
  return await snarkjs.groth16.verify(vkey, publicSignals, proof);
};
