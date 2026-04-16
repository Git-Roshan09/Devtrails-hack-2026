// metro.config.js
// Windows fix: "Error: spawn UNKNOWN" occurs when Metro's jest-worker tries to fork
// too many child processes. Capping maxWorkers to 1 forces single-threaded bundling
// which is stable on Windows without affecting correctness.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Windows: prevent "spawn UNKNOWN" / ChildProcess fork failure in jest-worker
config.maxWorkers = 1;

module.exports = config;
