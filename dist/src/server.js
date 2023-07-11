"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
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
var faker_1 = require("@faker-js/faker");
// HTTP is to get info from the server about configuration, rooms, etc
var HTTP_PORT = 3001;
// Socket is to communicate chat room messages back and forth
var SOCKET_PORT = 3002;
// Testing Mode
var TESTING = true;
// Deal with bigints in JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};
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
var TESTGROUPID;
// TODO get the claim code manager working with redis to store the state of the rooms and claim codes in a redis database that persists across server restarts
// Redis
var redisClient = (0, redis_1.createClient)();
redisClient.connect().then(function () { return (0, utils_1.pp)('Redis Connected'); });
redisClient.get('rooms').then(function (rooms) {
    rooms = JSON.parse(rooms);
    if (rooms) {
        loadedRooms = rooms;
    }
    else {
        loadedRooms = rooms_1.rooms;
        redisClient.set('rooms', JSON.stringify(loadedRooms));
    }
    (0, utils_1.pp)({ 'Loaded Rooms': loadedRooms });
});
var ccm;
redisClient.get('ccm').then(function (cc) {
    TESTGROUPID = BigInt(loadedRooms[0].id);
    if (!cc) {
        ccm = new discreetly_claimcodes_1.default();
        ccm.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
        var ccs_1 = ccm.getClaimCodeSets();
        redisClient.set('ccm', JSON.stringify(ccs_1));
    }
    else {
        ccm = new discreetly_claimcodes_1.default(JSON.parse(cc));
        if (ccm.getUsedCount(TESTGROUPID).unusedCount < 5) {
            ccm.generateClaimCodeSet(10, TESTGROUPID, 'TEST');
            var ccs_2 = ccm.getClaimCodeSets();
            redisClient.set('ccm', JSON.stringify(ccs_2));
        }
    }
    var ccs = ccm.getClaimCodeSets();
});
redisClient.on('error', function (err) { return (0, utils_1.pp)('Redis Client Error: ' + err, 'error'); });
io.on('connection', function (socket) {
    (0, utils_1.pp)('SocketIO: a user connected', 'debug');
    socket.on('validateMessage', function (msg) {
        (0, utils_1.pp)({ 'VALIDATING MESSAGE ID': msg.id.slice(0, 11), 'MSG:': msg.message });
        var timestamp = Date.now().toString();
        var valid = (0, verifier_1.default)(msg);
        if (!valid) {
            (0, utils_1.pp)('INVALID MESSAGE', 'warn');
            return;
        }
        io.emit('messageBroadcast', msg);
    });
    socket.on('disconnect', function () {
        (0, utils_1.pp)('SocketIO: user disconnected');
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
    (0, utils_1.pp)('Express: fetching server info');
    res.json(rooms_1.serverConfig);
});
app.get('/api/rooms', function (req, res) {
    (0, utils_1.pp)('Express: fetching rooms');
    res.json(loadedRooms);
});
app.get('/api/rooms/:id', function (req, res) {
    // TODO This should return the room info for the given room ID
    (0, utils_1.pp)(String('Express: fetching room info for ' + req.params.id));
    var room = loadedRooms
        .flatMap(function (rooms) { return rooms.rooms; })
        .filter(function (room) { return room.id === req.params.id; });
    res.json(room);
});
// TODO api endpoint that creates new rooms and generates invite codes for them
app.post('/join', function (req, res) {
    var data = req.body;
    var code = data.code, idc = data.idc;
    (0, utils_1.pp)('Express[/join]: claiming code:' + code);
    var result = ccm.claimCode(code);
    var groupID = result.groupID;
    if (result.status === 'CLAIMED') {
        var claimedRooms_1 = [];
        var alreadyAddedRooms_1 = [];
        loadedRooms.forEach(function (group) {
            if (group.id == groupID) {
                group.rooms.forEach(function (room) {
                    var _a = (0, utils_1.addIdentityToRoom)(BigInt(room.id), BigInt(idc), loadedRooms), status = _a.status, roomGroups = _a.roomGroups;
                    loadedRooms = roomGroups;
                    redisClient.set('rooms', JSON.stringify(loadedRooms));
                    if (status) {
                        claimedRooms_1.push(room);
                    }
                    else {
                        alreadyAddedRooms_1.push(room);
                    }
                });
            }
        });
        var r = __spreadArray(__spreadArray([], claimedRooms_1, true), alreadyAddedRooms_1, true);
        if (claimedRooms_1.length > 0) {
            res.status(200).json({ status: 'valid', rooms: r });
        }
        else if (alreadyAddedRooms_1.length > 0) {
            res.status(200).json({ status: 'already-added', rooms: r });
        }
        else {
            res.status(451).json({ status: 'invalid' });
        }
        // the DB should be updated after we successfully send a response
        redisClient.set('ccm', JSON.stringify(ccm.getClaimCodeSets()));
    }
    else {
        res.status(451).json({ status: 'invalid' });
    }
});
// TODO we are going to need endpoints that take a password that will be in a .env file to generate new roomGroups, rooms, and claim codes
app.post('/group/add', function (req, res) {
    var data = req.body;
    var password = data.password, groupName = data.groupName, rooms = data.rooms, codes = data.codes;
    if (password === process.env.PASSWORD) {
        var roomGroups = (0, utils_1.createGroup)(groupName, rooms, loadedRooms);
        loadedRooms = roomGroups;
        redisClient.set('rooms', JSON.stringify(loadedRooms));
        res.status(201).json({ status: "Created group ".concat(groupName), loadedRooms: loadedRooms });
    }
});
app.get('/logclaimcodes', function (req, res) {
    (0, utils_1.pp)('-----CLAIMCODES-----', 'debug');
    (0, utils_1.pp)(ccm.getClaimCodeSet(TESTGROUPID));
    (0, utils_1.pp)('-----ENDOFCODES-----', 'debug');
    res.status(200).json({ status: 'ok' });
});
app.listen(HTTP_PORT, function () {
    (0, utils_1.pp)("Express Http Server is running at http://localhost:".concat(HTTP_PORT));
});
socket_server.listen(SOCKET_PORT, function () {
    (0, utils_1.pp)("SocketIO Server is running at http://localhost:".concat(SOCKET_PORT));
});
// Disconnect from redis on exit
process.on('SIGINT', function () {
    (0, utils_1.pp)('disconnecting redis');
    redisClient.disconnect().then(process.exit());
});
if (TESTING) {
    var randomMessagePicker = /** @class */ (function () {
        function randomMessagePicker(values, weights) {
            this.values = values;
            this.weightSums = [];
            var sum = 0;
            for (var _i = 0, weights_1 = weights; _i < weights_1.length; _i++) {
                var weight = weights_1[_i];
                sum += weight;
                this.weightSums.push(sum);
            }
        }
        randomMessagePicker.prototype.pick = function () {
            var rand = Math.random() * this.weightSums[this.weightSums.length - 1];
            var index = this.weightSums.findIndex(function (sum) { return rand < sum; });
            return this.values[index]();
        };
        return randomMessagePicker;
    }());
    var values = [
        faker_1.faker.finance.ethereumAddress,
        faker_1.faker.company.buzzPhrase,
        faker_1.faker.lorem.sentence,
        faker_1.faker.hacker.phrase
    ];
    var weights = [1, 3, 2, 8];
    var picker_1 = new randomMessagePicker(values, weights);
    setInterval(function () {
        var message = {
            id: faker_1.faker.number.bigInt(),
            room: '7458174823225695762087107782399226439860424529052640186229953289032606624581',
            message: picker_1.pick(),
            timestamp: Date.now().toString(),
            epoch: Math.floor(Date.now() / 10000)
        };
        console.log('SENDING TEST MESSAGE');
        io.emit('messageBroadcast', message);
    }, 10000);
}
