"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const groupController_1 = require("../controllers/groupController");
const router = (0, express_1.Router)();
router.post('/', auth_1.authenticate, groupController_1.createGroupValidation, groupController_1.createGroup);
router.get('/', auth_1.authenticate, groupController_1.getGroups);
router.get('/:groupId/balances', auth_1.authenticate, groupController_1.getGroupBalances);
router.get('/:groupId/settlements', auth_1.authenticate, groupController_1.getGroupSettlements);
router.post('/:groupId/settle', auth_1.authenticate, groupController_1.settleGroupMember);
router.post('/:groupId/members', auth_1.authenticate, groupController_1.addGroupMember);
router.get('/:groupId', auth_1.authenticate, groupController_1.getGroupById);
router.delete('/:groupId', auth_1.authenticate, groupController_1.deleteGroup);
exports.default = router;
//# sourceMappingURL=groupRoutes.js.map