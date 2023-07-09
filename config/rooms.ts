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

const idcommitment_1 = genId(serverID, 0n);
const idcommitment_2 = genId(serverID, 1n);
const idcommitment_3 = genId(serverID, 2n);
const idcommitment_4 = genId(serverID, 3n);
const idcommitment_5 = genId(serverID, 4n);

export const rooms: RoomGroupI[] = [
  {
    name: 'Discreetly',
    rooms: [
      {
        id: genId(serverID, 'General'),
        name: 'General',
        membership: { identityCommitments: [idcommitment_1, idcommitment_2, idcommitment_5] },
        rateLimit: 1000
      },
      {
        id: genId(serverID, 'Test'),
        name: 'Test',
        membership: {
          identityCommitments: [
            idcommitment_1,
            idcommitment_2,
            idcommitment_3,
            idcommitment_4,
            idcommitment_5
          ]
        },
        rateLimit: 10000
      },
      {
        id: genId(serverID, '1EthRoom'),
        name: '1EthRoom',
        membership: { identityCommitments: [] },
        rateLimit: 100
      }
    ]
  },
  {
    name: 'Events',
    rooms: [
      {
        id: genId(serverID, 'Devconnect 2023'),
        name: 'Devconnect 2023',
        membership: { identityCommitments: [] },
        rateLimit: 1000
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
