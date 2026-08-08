"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const categoryController_1 = require("../controllers/categoryController");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, categoryController_1.getCategories);
router.post('/', auth_1.authenticate, categoryController_1.createCategory);
router.put('/:categoryId', auth_1.authenticate, categoryController_1.updateCategory);
router.delete('/:categoryId', auth_1.authenticate, categoryController_1.deleteCategory);
exports.default = router;
//# sourceMappingURL=categoryRoutes.js.map