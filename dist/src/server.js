"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var cors = require("cors");
var redis_1 = require("redis");
var rooms_1 = require("../config/rooms");
var verifier_1 = require("./verifier");
var discreetly_claimcodes_1 = require("discreetly-claimcodes");
// Deal with bigints in JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};
// HTTP is to get info from the server about configuration, rooms, etc
var http_port = 3001;
// Socket is to communicate chat room messages back and forth
var socket_port = 3002;
var app = express();
var socket_server = new http_1.Server(app);
app.use(express.json());
var io = new socket_io_1.Server(socket_server, {
    cors: {
        origin: '*'
    }
});
var userCount = {};
var loadedRooms;
// TODO get the claim code manager working with redis to store the state of the rooms and claim codes in a redis database that persists across server restarts
// Redis
var redisClient = (0, redis_1.createClient)();
redisClient.connect().then(function () { return console.log('Redis Connected'); });
var ccm;
redisClient.get('ccm').then(function (cc) {
    if (!cc) {
        ccm = new discreetly_claimcodes_1.default();
        ccm.generateClaimCodeSet(10, 999, 'TEST');
        var ccs = ccm.getClaimCodeSets();
        redisClient.set('ccm', JSON.stringify(ccs));
    }
    else {
        ccm = new discreetly_claimcodes_1.default(JSON.parse(cc));
        if (ccm.getUsedCount(999).unusedCount < 5) {
            ccm.generateClaimCodeSet(10, 999, 'TEST');
            var ccs = ccm.getClaimCodeSets();
            redisClient.set('ccm', JSON.stringify(ccs));
        }
    }
});
redisClient.get('ccm').then(function (res) { return console.log(res); });
redisClient.get('rooms').then(function (rooms) {
    rooms = JSON.parse(rooms);
    if (rooms) {
        console.log('Rooms', rooms);
        loadedRooms = rooms;
    }
    else {
        loadedRooms = rooms_1.rooms;
        redisClient.set('rooms', JSON.stringify(loadedRooms));
    }
    console.log('Loaded Rooms:', loadedRooms);
});
redisClient.on('error', function (err) { return console.log('Redis Client Error', err); });
io.on('connection', function (socket) {
    console.debug('a user connected');
    socket.on('validateMessage', function (msg) {
        console.log('VALIDATING MESSAGE ID:', msg.id.slice(0, 11), 'MSG:', msg.message);
        var timestamp = Date.now().toString();
        var valid = (0, verifier_1.default)(msg);
        if (!valid) {
            console.log('INVALID MESSAGE');
            return;
        }
        io.emit('messageBroadcast', msg);
    });
    socket.on('disconnect', function () {
        console.log('user disconnected');
    });
    socket.on('joinRoom', function (roomID) {
        var id = roomID.toString();
        userCount[id] = userCount[id] ? userCount[id] + 1 : 1;
    });
    socket.on('leaveRoom', function (roomID) {
        var id = roomID.toString();
        userCount[id] = userCount[id] ? userCount[id] - 1 : 0;
    });
});
app.use(cors({
    origin: '*'
}));
app.get(['/', '/api'], function (req, res) {
    console.log('fetching server info');
    res.json(rooms_1.serverConfig);
});
app.get('/api/rooms', function (req, res) {
    console.log('fetching rooms');
    res.json(loadedRooms);
});
app.get('/api/rooms/:id', function (req, res) {
    // TODO This should return the room info for the given room ID
    console.log('fetching room info', req.params.id);
    var room = loadedRooms.flatMap(function (rooms) { return rooms.rooms; }).filter(function (room) { return room.id === req.params.id; });
    res.json(room);
});
// TODO api endpoint that creates new rooms and generates invite codes for them
app.post('/join', function (req, res) {
    var _a = req.body, code = _a.code, idc = _a.idc;
    console.log('claiming code:', code, 'with identityCommitment', idc);
    // TODO This is where we would validate the claim/invite code
    // TODO the `result` is in this format: https://github.com/AtHeartEngineering/Discreetly/blob/f2ea89d4b87004693985854e17a4e669177c4df3/packages/claimCodes/src/manager.ts#L10
    var result = ccm.claimCode(code);
    if (result.status === 'CLAIMED') {
        // join room
        // update redis with new code status
        redisClient.set('ccm', JSON.stringify(ccm.getClaimCodeSets()));
        // get the groupId from redis so the client can join that group
        // TODO The `groupID` is the room ID like in https://github.com/AtHeartEngineering/Discreetly/blob/acc670fc4c43aa545dbbd03817879abfe5bc819e/packages/server/config/rooms.ts#L37
        // TODO If the claim code is valid, then we would add the user to the room
        redisClient.get('ccm').then(function (cc) {
            var data = JSON.parse(cc);
            for (var group in data) {
                var codes = data[group].claimCodes;
                for (var _i = 0, codes_1 = codes; _i < codes_1.length; _i++) {
                    var claim = codes_1[_i];
                    if (claim.code === code) {
                        console.log("GROUPID", data[group].groupID);
                    }
                }
            }
        });
        console.log('Code claimed');
    }
    else {
        console.error('Code already claimed');
    }
    // const identityCommitment = data.identityCommitment; // FIX this is the identity commitment from the user, think of it as a user ID
    res.status(200).json({ code: code });
});
app.listen(http_port, function () {
    console.log("Http Server is running at http://localhost:".concat(http_port));
});
socket_server.listen(socket_port, function () {
    console.log("Socket Server is running at http://localhost:".concat(socket_port));
});
// // Disconnect from redis on exit
// process.on('SIGINT', () => {
//   console.log('disconnecting redis');
//   redisClient.disconnect().then(process.exit());
// });
