"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const database_1 = __importDefault(require("./config/database"));
const seedTestUsers_1 = require("./utils/seedTestUsers");
const keepAlive_1 = require("./utils/keepAlive");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const PORT = parseInt(process.env.PORT || '5000', 10);
const runSchema = async () => {
    const schemaPath = path_1.default.join(__dirname, 'schema.sql');
    const fallbackPath = path_1.default.join(__dirname, '..', 'src', 'schema.sql');
    const resolved = fs_1.default.existsSync(schemaPath)
        ? schemaPath
        : fs_1.default.existsSync(fallbackPath)
            ? fallbackPath
            : null;
    if (!resolved) {
        console.warn('schema.sql not found, skipping schema init');
        return;
    }
    const schema = fs_1.default.readFileSync(resolved, 'utf8');
    try {
        await database_1.default.query(schema);
        console.log('Database schema initialized');
    }
    catch (error) {
        console.error('Schema setup error:', error);
    }
};
const startServer = async () => {
    await runSchema();
    await (0, seedTestUsers_1.seedTestUsers)();
    const server = http_1.default.createServer(app_1.default);
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Accessible at http://<your-ip>:${PORT}/api`);
        (0, keepAlive_1.startKeepAlive)();
    });
};
startServer();
//# sourceMappingURL=server.js.map