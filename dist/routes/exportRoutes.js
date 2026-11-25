"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const exportController_1 = require("../controllers/exportController");
const router = (0, express_1.Router)();
router.get('/excel', auth_1.authenticate, exportController_1.exportExcel);
exports.default = router;
//# sourceMappingURL=exportRoutes.js.map