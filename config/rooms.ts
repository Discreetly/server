import { MembershipI, RoomGroupI, ServerI, genId } from 'discreetly-interfaces';
import 'dotenv/config';

// TODO THIS SHOULD BE AN ENVIRONMENTAL VARIABLE STORED IN .env FILE
// IF THIS FILE DOESN'T EXIST, GENERATE A RANDOM ID AND STORE IT IN THE FILE
let serverID = BigInt(999);

try {
  serverID = process.env.serverID ? (process.env.serverID as unknown as bigint) : 999n;
} catch (error) {
  console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', serverID);

export const rooms: RoomGroupI[] = [
  {
    name: 'Discreetly Test',
    id: genId(serverID, 'Discreetly'),
    rooms: [
      {
        id: genId(serverID, 'General'),
        name: 'General 1 Second',
        membership: { identityCommitments: [] },
        rateLimit: 1000 // in ms
      },
      {
        id: genId(serverID, '10sec'),
        name: '10 Second Room',
        membership: {
          identityCommitments: []
        },
        rateLimit: 10000 // in ms
      }
    ]
  },
  {
    name: 'SERVER TEST',
    id: genId(serverID, 'Test'),
    rooms: [
      {
        id: genId(serverID, 'Test'),
        name: 'Test',
        membership: {
          identityCommitments: []
        },
        rateLimit: 10000 // in ms
      }
    ]
  }
];

export const serverConfig: ServerI = {
  id: serverID,
  name: 'Localhost',
  serverInfoEndpoint: 'localhost:3001',
  messageHandlerSocket: 'http://localhost:3002',
  version: '0.0.1',
  roomGroups: rooms
};
