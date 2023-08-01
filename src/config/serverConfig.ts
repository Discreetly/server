import type { ServerI } from 'discreetly-interfaces';
import 'dotenv/config';

// TODO THIS SHOULD BE AN ENVIRONMENTAL VARIABLE STORED IN .env FILE
// IF THIS FILE DOESN'T EXIST, GENERATE A RANDOM ID AND STORE IT IN THE FILE
let SERVER_ID: bigint;
let PORT: string;
let NAME: string;

try {
  SERVER_ID = process.env.SERVER_ID ? (process.env.SERVER_ID as unknown as bigint) : 0n;
} catch (error) {
  console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', SERVER_ID);

try {
  PORT = process.env.SERVER_PORT ? process.env.SERVER_PORT : '8000';
} catch (err) {
  console.error('Error reading PORT from .env file!');
}

try {
  NAME = process.env.SERVER_NAME ? process.env.SERVER_NAME : 'localhost';
} catch (err) {
  console.error('Error reading PORT from .env file!');
}

export const serverConfig: ServerI = {
  id: SERVER_ID,
  name: NAME,
  serverInfoEndpoint: PORT,
  messageHandlerSocket: PORT,
  version: '0.0.1'
};
