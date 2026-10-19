// PM2 keeps the server running and restarts it after a crash or a reboot.
module.exports = {
  apps: [{
    name: 'prevoir',
    script: 'start.js',
    instances: 1,            // keep 1: SQLite and in-memory rate limits assume a single process
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' }
  }]
};
