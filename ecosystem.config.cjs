module.exports = {
  apps: [{
    name: 'stubs-api',
    script: 'npx',
    args: 'tsx src/index.ts',
    cwd: '/var/www/stubs',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    watch: false
  }]
};
