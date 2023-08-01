import type { ServerI } from 'discreetly-interfaces';
import 'dotenv/config';

// TODO THIS SHOULD BE AN ENVIRONMENTAL VARIABLE STORED IN .env FILE
// IF THIS FILE DOESN'T EXIST, GENERATE A RANDOM ID AND STORE IT IN THE FILE
let server_ID: bigint;

try {
  server_ID = process.env.SERVER_ID ? (process.env.SERVER_ID as unknown as bigint) : 0n;
} catch (error) {
  console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', server_ID);

export const serverConfig: ServerI = {
  id: server_ID,
  name: 'Localhost',
  serverInfoEndpoint: 'localhost:3001',
  messageHandlerSocket: 'localhost:3002',
  version: '0.0.1'
};
