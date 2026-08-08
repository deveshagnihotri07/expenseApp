"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const expenseController_1 = require("../controllers/expenseController");
const router = (0, express_1.Router)();
router.post('/', auth_1.authenticate, expenseController_1.createExpense);
router.get('/', auth_1.authenticate, expenseController_1.getExpenses);
router.get('/:expenseId', auth_1.authenticate, expenseController_1.getExpenseById);
router.put('/:expenseId', auth_1.authenticate, expenseController_1.updateExpense);
router.post('/:expenseId/settle', auth_1.authenticate, expenseController_1.settleExpense);
router.delete('/:expenseId', auth_1.authenticate, expenseController_1.deleteExpense);
exports.default = router;
//# sourceMappingURL=expenseRoutes.js.map