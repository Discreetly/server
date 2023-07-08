"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genId = void 0;
var poseidon2_1 = require("poseidon-lite/poseidon2");
function genId(serverID, roomName) {
    if (typeof roomName === 'string') {
        var roomNum = '';
        for (var i = 0; i < roomName.length; i++) {
            roomNum += roomName.charCodeAt(i).toString();
        }
        return (0, poseidon2_1.poseidon2)([serverID, BigInt(roomNum)]);
    }
    return (0, poseidon2_1.poseidon2)([serverID, BigInt(roomName)]);
}
exports.genId = genId;
