"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const groupRoutes_1 = __importDefault(require("./routes/groupRoutes"));
const expenseRoutes_1 = __importDefault(require("./routes/expenseRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const errorHandler_1 = require("./middleware/errorHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use((0, morgan_1.default)('dev'));
app.get('/', (req, res) => {
    res.json({ message: 'Splitwise Clone API' });
});
app.use('/api/auth', authRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/groups', groupRoutes_1.default);
app.use('/api/expenses', expenseRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/analytics', analyticsRoutes_1.default);
app.use('/health', healthRoutes_1.default);
app.use('/api/health', healthRoutes_1.default);
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map