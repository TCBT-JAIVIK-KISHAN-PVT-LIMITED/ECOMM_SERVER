module.exports = {
  apps: [
    {
      name: 'tcbt-app-server',
      script: './dist/apps/main-server/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'tcbt-shipping-service',
      script: './dist/apps/shipping-service/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        SHIPPING_SERVICE_PORT: 3001,
      },
    },
  ],
};
