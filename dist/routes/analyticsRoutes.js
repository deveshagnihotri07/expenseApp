"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const analyticsController_1 = require("../controllers/analyticsController");
const router = (0, express_1.Router)();
router.get('/dashboard', auth_1.authenticate, analyticsController_1.getDashboardOverview);
router.get('/categories', auth_1.authenticate, analyticsController_1.getCategoryAnalytics);
router.get('/groups', auth_1.authenticate, analyticsController_1.getGroupAnalytics);
router.get('/monthly-trend', auth_1.authenticate, analyticsController_1.getMonthlyTrend);
router.get('/friends', auth_1.authenticate, analyticsController_1.getFriendAnalytics);
exports.default = router;
//# sourceMappingURL=analyticsRoutes.js.map