"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const userController_1 = require("../controllers/userController");
const router = (0, express_1.Router)();
router.get('/profile', auth_1.authenticate, userController_1.getUserProfile);
router.put('/profile', auth_1.authenticate, userController_1.updateUserProfile);
router.get('/users', auth_1.authenticate, userController_1.getAllUsers);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map