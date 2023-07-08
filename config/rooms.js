"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfig = exports.rooms = void 0;
var poseidon2_1 = require("poseidon-lite/poseidon2");
require("dotenv/config");
var serverID = 999n;
console.log(process.env.serverID);
try {
    serverID = process.env.serverID ? process.env.serverID : 999n;
}
catch (error) {
    console.error('Error reading serverID from .env file!');
}
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
        id: room_1,
        name: 'General',
        membership: [fake_user_1, fake_user_2]
    },
    {
        id: room_2,
        name: 'Event 1',
        membership: [fake_user_1, fake_user_3, fake_user_5]
    },
    {
        id: room_3,
        name: 'Club 1',
        membership: [fake_user_2, fake_user_3, fake_user_4]
    },
    {
        id: room_4,
        name: 'Test 1',
        membership: [fake_user_4, fake_user_5]
    }
];
exports.serverConfig = {
    version: '0.0.1',
    rooms: exports.rooms,
    wsPort: 3001
};
