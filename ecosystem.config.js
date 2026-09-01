module.exports = {
  apps: [
    {
      name: 'diu-nexus-server',
      script: 'server/server.js',
      instances: 'max', // Scale across all available CPU cores for 500+ to 10,000+ users
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
