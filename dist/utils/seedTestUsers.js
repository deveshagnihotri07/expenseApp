"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedTestUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const TEST_USERS = [
    { name: 'Alice', email: 'alice@test.com', password: 'password123' },
    { name: 'Bob', email: 'bob@test.com', password: 'password123' },
];
const seedTestUsers = async () => {
    for (const user of TEST_USERS) {
        try {
            const existing = await (0, database_1.query)('SELECT id FROM users WHERE email = $1', [
                user.email,
            ]);
            if (existing.rows.length > 0) {
                console.log(`Test user already exists: ${user.email}`);
                continue;
            }
            const hashedPassword = await bcryptjs_1.default.hash(user.password, 10);
            await (0, database_1.query)('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)', [user.name, user.email, hashedPassword]);
            console.log(`Created test user: ${user.email} / ${user.password}`);
        }
        catch (error) {
            console.error(`Failed to create test user ${user.email}:`, error);
        }
    }
};
exports.seedTestUsers = seedTestUsers;
//# sourceMappingURL=seedTestUsers.js.map