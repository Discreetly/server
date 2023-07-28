import type { ServerI } from 'discreetly-interfaces';
import 'dotenv/config';

// TODO THIS SHOULD BE AN ENVIRONMENTAL VARIABLE STORED IN .env FILE
// IF THIS FILE DOESN'T EXIST, GENERATE A RANDOM ID AND STORE IT IN THE FILE
let serverID: bigint;

try {
  serverID = process.env.SERVERID ? (process.env.SERVERID as unknown as bigint) : 0n;
} catch (error) {
  console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', serverID);

export const serverConfig: ServerI = {
  id: serverID,
  name: 'Localhost',
  serverInfoEndpoint: '3001',
  messageHandlerSocket: '3002',
  version: '0.0.1'
};
