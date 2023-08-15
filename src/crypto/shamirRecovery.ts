/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ZqField } from 'ffjavascript';

/*
  This is the "Baby Jubjub" curve described here:
  https://iden3-docs.readthedocs.io/en/latest/_downloads/33717d75ab84e11313cc0d8a090b636f/Baby-Jubjub.pdf
*/
const SNARK_FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

// Creates the finite field
const Fq = new ZqField(SNARK_FIELD_SIZE);

/**
 * Recovers secret from two shares
 * @param x1 signal hash of first message
 * @param x2 signal hash of second message
 * @param y1 yshare of first message
 * @param y2 yshare of second message
 * @returns identity secret
 */
export function shamirRecovery(x1: bigint, x2: bigint, y1: bigint, y2: bigint): bigint {
  const slope = Fq.div(Fq.sub(y2, y1), Fq.sub(x2, x1));
  const privateKey = Fq.sub(y1, Fq.mul(slope, x1));

  return Fq.normalize(privateKey);
}
