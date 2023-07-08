"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = exports.rooms = void 0;
var poseidon2_1 = require("poseidon-lite/poseidon2");
require("dotenv/config");
var serverID = 999n;
try {
    serverID = process.env.serverID ? process.env.serverID : 999n;
}
catch (error) {
    console.error('Error reading serverID from .env file!');
}
console.log('SERVERID:', serverID);
var room_1 = (0, poseidon2_1.poseidon2)([serverID, 1n]);
var room_2 = (0, poseidon2_1.poseidon2)([serverID, 2n]);
var room_3 = (0, poseidon2_1.poseidon2)([serverID, 3n]);
var room_4 = (0, poseidon2_1.poseidon2)([serverID, 4n]);
var fake_user_1 = (0, poseidon2_1.poseidon2)([0n, 1n]);
var fake_user_2 = (0, poseidon2_1.poseidon2)([0n, 2n]);
var fake_user_3 = (0, poseidon2_1.poseidon2)([0n, 3n]);
var fake_user_4 = (0, poseidon2_1.poseidon2)([0n, 4n]);
var fake_user_5 = (0, poseidon2_1.poseidon2)([0n, 5n]);
exports.rooms = [
    {
        name: 'Default',
        rooms: [
            {
                id: room_1,
                name: 'General',
                membership: [fake_user_1, fake_user_2, fake_user_5]
            }
        ]
    },
    {
        name: 'Games',
        rooms: [
            {
                id: room_3,
                name: 'Gunfire Reborn',
                membership: [fake_user_2, fake_user_3, fake_user_4]
            }
        ]
    },
    {
        name: 'Events',
        rooms: [
            {
                id: room_2,
                name: 'DevConnect 2023',
                membership: [fake_user_1, fake_user_3, fake_user_5]
            }
        ]
    }
];
exports.serverConfig = {
    name: 'Discreetly',
    serverInfoEndpoint: 'localhost:3001',
    messageHandlerSocket: 'localhost:3002',
    version: '0.0.1',
    roomGroups: exports.rooms
};
