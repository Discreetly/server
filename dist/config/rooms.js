"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = exports.rooms = void 0;
var discreetly_interfaces_1 = require("discreetly-interfaces");
require("dotenv/config");
// TODO THIS SHOULD BE AN ENVIRONMENTAL VARIABLE STORED IN .env FILE
// IF THIS FILE DOESN'T EXIST, GENERATE A RANDOM ID AND STORE IT IN THE FILE
var serverID = BigInt(999);
try {
    serverID = process.env.serverID ? process.env.serverID : 999n;
}
catch (error) {
    console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', serverID);
var idcommitment_1 = (0, discreetly_interfaces_1.genId)(serverID, 0n);
var idcommitment_2 = (0, discreetly_interfaces_1.genId)(serverID, 1n);
var idcommitment_3 = (0, discreetly_interfaces_1.genId)(serverID, 2n);
var idcommitment_4 = (0, discreetly_interfaces_1.genId)(serverID, 3n);
var idcommitment_5 = (0, discreetly_interfaces_1.genId)(serverID, 4n);
exports.rooms = [
    {
        name: 'Discreetly',
        rooms: [
            {
                id: (0, discreetly_interfaces_1.genId)(serverID, 'General'),
                name: 'General',
                membership: { identityCommitments: [idcommitment_1, idcommitment_2, idcommitment_5] },
                rateLimit: 1000
            },
            {
                id: (0, discreetly_interfaces_1.genId)(serverID, 'Test'),
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
                id: (0, discreetly_interfaces_1.genId)(serverID, '1EthRoom'),
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
                id: (0, discreetly_interfaces_1.genId)(serverID, 'Devconnect 2023'),
                name: 'Devconnect 2023',
                membership: { identityCommitments: [] },
                rateLimit: 1000
            }
        ]
    }
];
exports.serverConfig = {
    id: serverID,
    name: 'Discreetly',
    serverInfoEndpoint: 'localhost:3001',
    messageHandlerSocket: 'http://localhost:3002',
    version: '0.0.1',
    roomGroups: exports.rooms
};
