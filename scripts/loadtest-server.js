const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dataDir = path.resolve(root, process.env.DATA_DIR || "data-loadtest");

if (process.env.KEEP_DATA !== "1") {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

process.env.MOCK_LLM = "true";
process.env.NODE_ENV = "production";
process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "3100";
process.env.DATA_DIR = dataDir;

console.log(`load test server: http://${process.env.HOST}:${process.env.PORT} DATA_DIR=${dataDir}`);

require("./start.js");
