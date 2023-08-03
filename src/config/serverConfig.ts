import type { ServerI } from 'discreetly-interfaces';
import 'dotenv/config';

let SERVER_ID: bigint;
let NAME: string;

try {
  SERVER_ID = process.env.SERVER_ID ? (process.env.SERVER_ID as unknown as bigint) : 0n;
} catch (error) {
  console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', SERVER_ID);

try {
  NAME = process.env.SERVER_NAME ? process.env.SERVER_NAME : 'localhost';
} catch (err) {
  console.error('Error reading PORT from .env file!');
}

export const serverConfig: ServerI = {
  id: SERVER_ID,
  name: NAME,
  version: '0.0.2'
};
