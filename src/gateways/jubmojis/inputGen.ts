/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { EdwardsPoint } from './babyJubjub';
import { MerkleProof } from './jubmoji.types';
import { hashEdwardsPublicKey, hexToBigInt } from './utils';
import { poseidon2 } from 'poseidon-lite/poseidon2';

export const MERKLE_TREE_DEPTH = 8; // We used a fixed depth merkle tree for now
// Precomputed hashes of zero for each layer of the merkle tree
export const MERKLE_TREE_ZEROS = [
  '0',
  '14744269619966411208579211824598458697587494354926760081771325075741142829156',
  '7423237065226347324353380772367382631490014989348495481811164164159255474657',
  '11286972368698509976183087595462810875513684078608517520839298933882497716792',
  '3607627140608796879659380071776844901612302623152076817094415224584923813162',
  '19712377064642672829441595136074946683621277828620209496774504837737984048981',
  '20775607673010627194014556968476266066927294572720319469184847051418138353016',
  '3396914609616007258851405644437304192397291162432396347162513310381425243293'
];

/**
 * Computes the merkle root based a list of public keys
 * Note that public keys must be in Twisted Edwards form
 * This is because we only ever use the Merkle Tree for in circuit verification,
 * and the circuit only ever uses Twisted Edwards points
 * @param pubKeys - The list of public keys to compute the merkle root of in Twisted Edwards form
 * @param hashFn - The hash function to use for the merkle tree. Defaults to Poseidon
 * @returns - The merkle root
 */
export const computeMerkleRoot = async (pubKeys: EdwardsPoint[]): Promise<bigint> => {
  const proof = await computeMerkleProof(pubKeys, 0);
  return proof.root;
};

/**
 * Generates a merkle proof for a given list of public keys and index
 * Once again, all public keys are represented in Twisted Edwards form
 * @param pubKeys - The list of public keys to generate the merkle proof for in Twisted Edwards form
 * @param index - The index of the public key to generate the merkle proof for
 * @param hashFn - The hash function to use for the merkle tree. Defaults to Poseidon
 * @returns - The merkle proof
 */
export const computeMerkleProof = async (
  pubKeys: EdwardsPoint[],
  index: number
): Promise<MerkleProof> => {
  // All public keys are hashed before insertion into the tree
  const leaves = await Promise.all(pubKeys.map((pubKey) => hashEdwardsPublicKey(pubKey)));

  let prevLayer: bigint[] = leaves;
  let nextLayer: bigint[] = [];
  let pathIndices: number[] = [];
  let siblings: bigint[] = [];

  for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
    pathIndices.push(index % 2);
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling =
      siblingIndex === prevLayer.length ? BigInt(MERKLE_TREE_ZEROS[i]) : prevLayer[siblingIndex];
    siblings.push(sibling);
    index = Math.floor(index / 2);

    for (let j = 0; j < prevLayer.length; j += 2) {
      const secondNode =
        j + 1 === prevLayer.length ? BigInt(MERKLE_TREE_ZEROS[i]) : prevLayer[j + 1];
      const nextNode = poseidon2([prevLayer[j], secondNode]);
      nextLayer.push(hexToBigInt(nextNode.toString()));
    }

    prevLayer = nextLayer;
    nextLayer = [];
  }
  const root = prevLayer[0];

  return { root, pathIndices, siblings: siblings };
};
