"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimCodeStatusEnum = void 0;
var bip39ish_1 = require("./bip39ish");
var ClaimCodeStatusEnum;
(function (ClaimCodeStatusEnum) {
    ClaimCodeStatusEnum["CLAIMED"] = "CLAIMED";
    ClaimCodeStatusEnum["NOT_FOUND"] = "NOT_FOUND";
    ClaimCodeStatusEnum["ALREADY_USED"] = "ALREADY_USED";
})(ClaimCodeStatusEnum || (exports.ClaimCodeStatusEnum = ClaimCodeStatusEnum = {}));
var emptyClaimCodeSet = {
    '0': {
        claimCodes: [],
        groupID: 0,
        generationTime: Date.now(),
        name: 'UNASSIGNED'
    }
};
var ClaimCodeManager = /** @class */ (function () {
    function ClaimCodeManager(claimCodeSetInput) {
        if (claimCodeSetInput === void 0) { claimCodeSetInput = emptyClaimCodeSet; }
        this.claimCodeSets = claimCodeSetInput;
    }
    ClaimCodeManager.generateRandomClaimCode = function (length) {
        if (length === void 0) { length = 2; }
        if (length < 1)
            throw new Error('length must be greater than 0');
        if (length > 24)
            throw new Error('length must be less than 24');
        var code = [];
        for (var i = 0; i < length; i++) {
            var randomIndex = Math.floor(Math.random() * bip39ish_1.default.length);
            code.push(bip39ish_1.default[randomIndex]);
        }
        return code.join('-');
    };
    ClaimCodeManager.generateClaimCodes = function (count, code_length, claimCodes) {
        if (claimCodes === void 0) { claimCodes = []; }
        var codes = [];
        for (var i = 0; i < count; i++) {
            var pass = false;
            var code = void 0;
            while (pass == false) {
                code = this.generateRandomClaimCode(code_length);
                if (codes.includes(code)) {
                    continue;
                }
                pass = true;
            }
            claimCodes.push({
                code: code,
                used: false
            });
        }
        return claimCodes;
    };
    ClaimCodeManager.markClaimCodeAsUsed = function (code, claimCodes) {
        var message = 'Successfully claimed code';
        var status = ClaimCodeStatusEnum.NOT_FOUND;
        for (var _i = 0, claimCodes_1 = claimCodes; _i < claimCodes_1.length; _i++) {
            var claimCode = claimCodes_1[_i];
            if (claimCode.code === code) {
                if (claimCode.used) {
                    message = "Claim code ".concat(code, " has already been used");
                    status = ClaimCodeStatusEnum.ALREADY_USED;
                    return { status: status, message: message, claimCodes: claimCodes };
                }
                claimCode.used = true;
                status = ClaimCodeStatusEnum.CLAIMED;
                return { status: status, message: message, claimCodes: claimCodes };
            }
        }
        message = "Claim code ".concat(code, " does not exist");
        status = ClaimCodeStatusEnum.NOT_FOUND;
        return { status: status, message: message, claimCodes: claimCodes };
    };
    ClaimCodeManager.prototype.generateClaimCodeSet = function (count, groupID, name, code_length) {
        if (groupID === void 0) { groupID = 0; }
        if (name === void 0) { name = ''; }
        if (code_length === void 0) { code_length = 4; }
        groupID = groupID.toString();
        if (this.claimCodeSets[groupID]) {
            this.claimCodeSets[groupID].claimCodes = ClaimCodeManager.generateClaimCodes(count, code_length, this.claimCodeSets[groupID].claimCodes);
        }
        else {
            this.claimCodeSets[groupID] = {
                claimCodes: ClaimCodeManager.generateClaimCodes(count, code_length),
                groupID: Number(groupID),
                generationTime: Date.now(),
                name: name
            };
        }
        this.claimCodeSets[groupID].groupID = Number(groupID);
        this.claimCodeSets[groupID].generationTime = Date.now();
        if (name) {
            this.claimCodeSets[groupID].name = name;
        }
        return this.claimCodeSets[groupID];
    };
    ClaimCodeManager.prototype.claimCode = function (code) {
        for (var claimCodeSet in this.claimCodeSets) {
            var result = ClaimCodeManager.markClaimCodeAsUsed(code, this.claimCodeSets[claimCodeSet].claimCodes);
            if (result.status === ClaimCodeStatusEnum.CLAIMED) {
                result.groupID = Number(claimCodeSet);
                return result;
            }
            else if (result.status === ClaimCodeStatusEnum.ALREADY_USED) {
                result.groupID = Number(claimCodeSet);
                return result;
            }
            else {
                continue;
            }
        }
        return {
            status: ClaimCodeStatusEnum.NOT_FOUND,
            message: "Claim code ".concat(code, " does not exist"),
            claimCodes: []
        };
    };
    ClaimCodeManager.prototype.getClaimCodeSets = function () {
        return this.claimCodeSets;
    };
    ClaimCodeManager.prototype.getClaimCodeSet = function (groupID) {
        groupID = groupID.toString();
        var o = { groupID: this.claimCodeSets[groupID] };
        return o;
    };
    ClaimCodeManager.prototype.getUsedCount = function (groupID) {
        groupID = groupID.toString();
        var usedCount = 0;
        var totalCount = this.claimCodeSets[groupID].claimCodes.length;
        for (var _i = 0, _a = this.claimCodeSets[groupID].claimCodes; _i < _a.length; _i++) {
            var claimCode = _a[_i];
            if (claimCode.used) {
                usedCount++;
            }
        }
        var unusedCount = totalCount - usedCount;
        return { usedCount: usedCount, unusedCount: unusedCount, totalCount: totalCount };
    };
    ClaimCodeManager.prototype.getGroupIdFromName = function (name) {
        for (var _i = 0, _a = Object.values(this.claimCodeSets); _i < _a.length; _i++) {
            var claimCodeSet = _a[_i];
            if (claimCodeSet.name === name) {
                return claimCodeSet.groupID;
            }
        }
        return -1;
    };
    return ClaimCodeManager;
}());
exports.default = ClaimCodeManager;
