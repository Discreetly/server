import { genId } from 'discreetly-interfaces'
import { serverConfig } from './config/serverConfig'
import { generateClaimCodes } from 'discreetly-claimcodes';
import type { ClaimCodeT } from 'discreetly-claimcodes';
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export function shim() {
  // Deal with bigints in JSON
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

export function genMockUsers(numMockUsers: number): string[] {
  // Generates random number of mock users between 0.5 x numMockusers and 2 x numMockUsers
  const newNumMockUsers = randn_bm(numMockUsers / 2, numMockUsers * 2);
  const mockUsers: string[] = [];
  for (let i = 0; i < newNumMockUsers; i++) {
    mockUsers.push(
      genId(
        serverConfig.id,
        // Generates a random string of length 10
        Math.random()
          .toString(36)
          .substring(2, 2 + 10) + i
      ).toString()
    );
  }
  return mockUsers;
}

export function genClaimCodeArray(numClaimCodes: number): { claimcode: string }[] {
  const claimCodes = generateClaimCodes(numClaimCodes);
  const codeArr: { claimcode: string }[] = claimCodes.map((code: ClaimCodeT) => ({
    claimcode: code.code
  }));
  return codeArr;
}
/**
 * Logs the provided string to the console with the specified log level.
 * @param {any} str - The string to log.
 * @param {string} [level='log'] - The log level to use. Can be one of 'log', 'debug', 'info', 'warn', 'warning', 'error', 'err', 'table', or 'assert'.
 */
export const pp = (str: any, level = 'log') => {
  str = JSON.stringify(str, null, 2);
  switch (level) {
    case 'log':
      console.log(str);
      break;
    case 'debug':
      console.debug(str);
      break;
    case 'info':
      console.info(str);
      break;
    case 'warn' || 'warning':
      console.warn(str);
      break;
    case 'error' || 'err':
      console.error(str);
      break;
    case 'table':
      console.table(str);
      break;
    case 'assert':
      console.assert(str);
      break;
    default:
      console.log(str);
  }
};

// from: https://stackoverflow.com/a/49434653/957648
export function randn_bm(min: number, max: number, skew = 1) {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0)
    num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
  else {
    num = Math.pow(num, skew); // Skew
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
  }
  return num;
}
