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
var utils_1 = require("./utils");
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
redisClient.get('rooms').then(function (rooms) {
    rooms = JSON.parse(rooms);
    if (rooms) {
        loadedRooms = rooms;
    }
    else {
        loadedRooms = rooms_1.rooms;
        redisClient.set('rooms', JSON.stringify(loadedRooms));
    }
    console.log('Rooms:', JSON.stringify(loadedRooms, null, 2));
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
    var room = loadedRooms
        .flatMap(function (rooms) { return rooms.rooms; })
        .filter(function (room) { return room.id === req.params.id; });
    res.json(room);
});
// TODO api endpoint that creates new rooms and generates invite codes for them
var testGroupId0 = "917472730658974787195329824193375792646499428986660190540754124137738350241";
var testGroupId1 = "355756154407663058879850750536398206548026044600409795496806929599466182253";
app.post('/join', function (req, res) {
    var data = req.body;
    console.log(data);
    var code = data.code, idc = data.idc;
    console.log('claiming code:', code, 'with identityCommitment', idc);
    var result = ccm.claimCode(code);
    var groupID = result.groupID;
    if (result.status === 'CLAIMED') {
        redisClient.set('ccm', JSON.stringify(ccm.getClaimCodeSets()));
        (0, utils_1.addIdentityToRoom)(testGroupId1, idc);
        console.log('Code claimed:', code);
        res.status(200).json({ groupID: groupID });
    }
    else {
        res.status(451).json({ status: 'invalid' });
    }
});
app.get('/logclaimcodes', function (req, res) {
    console.log('-----CLAIMCODES-----');
    console.log(JSON.stringify(ccm.getClaimCodeSets(), null, 2));
    console.log('-----ENDOFCODES-----');
});
app.listen(http_port, function () {
    console.log("Http Server is running at http://localhost:".concat(http_port));
});
socket_server.listen(socket_port, function () {
    console.log("Socket Server is running at http://localhost:".concat(socket_port));
});
// Disconnect from redis on exit
process.on('SIGINT', function () {
    console.log('disconnecting redis');
    redisClient.disconnect().then(process.exit());
});
// TODO we are going to need endpoints that take a password that will be in a .env file to generate new roomGroups, rooms, and claim codes
