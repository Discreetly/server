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
exports.rooms = [
    {
        name: 'Discreetly',
        id: (0, discreetly_interfaces_1.genId)(serverID, 'Discreetly'),
        rooms: [
            {
                id: (0, discreetly_interfaces_1.genId)(serverID, 'General'),
                name: 'General',
                membership: { identityCommitments: [] },
                rateLimit: 1000 // in ms
            },
            {
                id: (0, discreetly_interfaces_1.genId)(serverID, 'Test'),
                name: 'Test',
                membership: {
                    identityCommitments: []
                },
                rateLimit: 10000 // in ms
            }
        ]
    },
    {
        name: 'Events',
        id: (0, discreetly_interfaces_1.genId)(serverID, 'Events'),
        rooms: [
            {
                id: (0, discreetly_interfaces_1.genId)(serverID, 'Devconnect 2023'),
                name: 'Devconnect 2023',
                membership: { identityCommitments: [] },
                rateLimit: 1000 // in ms
            }
        ]
    }
];
exports.serverConfig = {
    id: serverID,
    name: 'Localhost',
    serverInfoEndpoint: 'localhost:3001',
    messageHandlerSocket: 'http://localhost:3002',
    version: '0.0.1',
    roomGroups: exports.rooms
};
