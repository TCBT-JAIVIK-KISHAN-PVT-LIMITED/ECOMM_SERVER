module.exports = {
  apps: [
    {
      name: "tcbt-app-server",
      cwd: "/home/ubuntu/app/current",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};