/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { EdwardsPoint, WeierstrassPoint, babyjubjub } from './babyJubjub';

/**
 * Converts a private key to a public key on the baby jubjub curve
 * @param privKey - The private key to convert
 * @returns The public key in Short Weierstrass form
 */
export const privateKeyToPublicKey = (privKey: bigint): WeierstrassPoint => {
  const pubKeyPoint = babyjubjub.ec.g.mul(privKey.toString(16));

  return WeierstrassPoint.fromEllipticPoint(pubKeyPoint);
};

/**
 * Computes public parameters T, U of the membership proof based on the provided R value
 * This ensures that T, U were generated appropriately
 * See: https://hackmd.io/HQZxucnhSGKT_VfNwB6wOw?view
 * @param R - The R value of the membership proof
 * @param msgHash - The hash of the message signed by the signature
 * @returns - The public parameters T, U
 */
export const computeTUFromR = (
  R: EdwardsPoint,
  msgHash: bigint
): { T: EdwardsPoint; U: EdwardsPoint } => {
  const Fs = babyjubjub.Fs;

  const shortR = R.toWeierstrass();
  const r = shortR.x % Fs.p;
  const rInv = Fs.inv(r);
  const ecR = babyjubjub.ec.curve.point(shortR.x.toString(16), shortR.y.toString(16));
  const ecT = ecR.mul(rInv.toString(16));
  const T = WeierstrassPoint.fromEllipticPoint(ecT);
  const G = babyjubjub.ec.curve.g;
  const rInvm = Fs.neg(Fs.mul(rInv, msgHash));
  const ecU = G.mul(rInvm.toString(16));
  const U = WeierstrassPoint.fromEllipticPoint(ecU);

  return { T: T.toEdwards(), U: U.toEdwards() };
};
