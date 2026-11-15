"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startKeepAlive = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;
const startKeepAlive = () => {
    if (process.env.NODE_ENV === 'test')
        return;
    const baseUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
    if (!baseUrl) {
        console.warn('Keep-alive skipped: set PUBLIC_URL or RENDER_EXTERNAL_URL to enable self-ping');
        return;
    }
    const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
    const client = healthUrl.startsWith('https') ? https_1.default : http_1.default;
    const ping = () => {
        const req = client.get(healthUrl, (res) => {
            res.resume();
            console.log(`Keep-alive ping ${healthUrl} -> ${res.statusCode}`);
        });
        req.setTimeout(10000, () => req.destroy());
        req.on('error', (error) => {
            console.error('Keep-alive ping failed:', error.message);
        });
    };
    ping();
    const interval = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
    interval.unref();
};
exports.startKeepAlive = startKeepAlive;
//# sourceMappingURL=keepAlive.js.map