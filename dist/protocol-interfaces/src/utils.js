"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBigInt = exports.genId = exports.str2BigInt = void 0;
var poseidon2_1 = require("poseidon-lite/poseidon2");
function str2BigInt(str) {
    var num = '';
    for (var i = 0; i < str.length; i++) {
        num += str.charCodeAt(i).toString();
    }
    return BigInt(num);
}
exports.str2BigInt = str2BigInt;
function genId(serverID, roomName) {
    if (typeof roomName === 'string') {
        return (0, poseidon2_1.poseidon2)([serverID, str2BigInt(roomName)]);
    }
    return (0, poseidon2_1.poseidon2)([serverID, BigInt(roomName)]);
}
exports.genId = genId;
function randomBigInt(bits) {
    if (bits === void 0) { bits = 253; }
    var hexBits = bits / 4;
    var hexString = '';
    for (var i = 0; i < hexBits; i++) {
        hexString += Math.floor(Math.random() * 16).toString(16);
    }
    return BigInt('0x' + hexString);
}
exports.randomBigInt = randomBigInt;
