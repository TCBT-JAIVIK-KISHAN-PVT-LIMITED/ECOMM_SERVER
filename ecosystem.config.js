module.exports = {
  apps: [
    {
      name: "tcbt-app-server",

      cwd: "/home/ubuntu/app/current",

      script: "dist/main.js",

      instances: 1,

      exec_mode: "fork",

      watch: false,

      autorestart: true,

      max_restarts: 5,

      restart_delay: 3000,

      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};