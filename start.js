// Entry point for hosting. Use this as the startup file (cPanel "Setup Node.js App", PM2, Docker).
// cPanel loads the startup file with require(), so the server must be started explicitly here.
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* no .env file: settings come from the host's environment variables */ }
require('./server.js').start();
