import type { ServerI } from 'discreetly-interfaces';
import 'dotenv/config';

let SERVER_ID: bigint = 0n;
let NAME: string = 'undefined';

try {
  SERVER_ID = process.env.SERVER_ID ? (process.env.SERVER_ID as unknown as bigint) : 0n;
  console.log('SERVERID:', SERVER_ID);
} catch (error) {
  console.error('Error reading serverID from .env file!');
}

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
