"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = exports.RoomType = void 0;
var RoomType;
(function (RoomType) {
    RoomType["PUBLIC"] = "public";
    RoomType["GATED"] = "gated";
    RoomType["PRIVATE"] = "private";
    RoomType["SECURE"] = "secure";
})(RoomType || (exports.RoomType = RoomType = {}));
var Server = /** @class */ (function () {
    function Server(server) {
        this.server = server;
        this.name = server.name;
        this.version = server.version;
        this.serverInfoEndpoint = server.serverInfoEndpoint;
        this.messageHandlerSocket = server.messageHandlerSocket;
        this.publicMembership = server.publicMembership;
        this.roomGroups = server.roomGroups;
        this.selectedRoom = server.selectedRoom
            ? server.selectedRoom
            : server.roomGroups[0].rooms[0].id;
    }
    Server.prototype.getRoomById = function (id) {
        return this.roomGroups
            .map(function (group) { return group.rooms; })
            .flat()
            .find(function (room) { return room.id === id; });
    };
    Server.prototype.getRoomByName = function (name) {
        return this.roomGroups
            .map(function (group) { return group.rooms; })
            .flat()
            .find(function (room) { return room.name === name; });
    };
    Server.prototype.getRoomGroupByName = function (name) {
        return this.roomGroups.find(function (group) { return group.name === name; });
    };
    Server.prototype.setRoomById = function (id) {
        if (this.getRoomById(id)) {
            this.selectedRoom = id;
            return id;
        }
        else {
            return -1;
        }
    };
    Server.prototype.getRoomHandlerSocket = function (id) {
        var room = this.getRoomById(id);
        if (room) {
            return room.messageHandlerSocket;
        }
        else {
            return this.messageHandlerSocket;
        }
    };
    return Server;
}());
exports.Server = Server;
