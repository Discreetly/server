import {
  ecrecover,
  pubToAddress,
  bufferToHex,
  fromRpcSig,
  toBuffer,
  hashPersonalMessage
} from 'ethereumjs-util';

/**
 * The sanitizeIDC function takes a string and returns a string.
 * The string is converted to a BigInt and then back to a string.
 * If the string has no loss of precision, it is returned.
 * Otherwise, an error is thrown.
 *
 * @param {string} idc - The string to be sanitized.
 * @returns {string} - The sanitized string if it has no loss of precision.
 * @throws {Error} - Throws an error if the string cannot be converted to a BigInt or if it loses precision.
 */
export function sanitizeIDC(idc: string): string {
  try {
    const tempBigInt = BigInt(idc);
    const tempString = tempBigInt.toString();
    if (idc === tempString) {
      return idc;
    } else {
      throw new Error('Invalid IDC provided.');
    }
  } catch (error) {
    throw new Error('Invalid IDC provided.');
  }
}

export function recoverPublicKey(message: string, signature: string): string {
      const msgHex = bufferToHex(Buffer.from(message));
      const msgBuffer = toBuffer(msgHex);
      const msgHash = hashPersonalMessage(msgBuffer);

      const { v, r, s } = fromRpcSig(signature);
      const publicKey = ecrecover(msgHash, v, r, s);
      const address = pubToAddress(publicKey);

      const recoveredAddress = bufferToHex(address);

      return recoveredAddress
}
