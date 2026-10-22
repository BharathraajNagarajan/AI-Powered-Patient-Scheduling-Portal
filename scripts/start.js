const path = require("node:path");

const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3000";

process.argv = [process.argv[0], "next", "start", "-H", host, "-p", String(port)];

require(path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next"));
