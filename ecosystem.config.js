module.exports = {
  apps: [
    {
      name: "bulsu-backend",
      cwd: "C:\\Users\\aljur\\BulSU-WiFi-Management\\bulsu-wifi-backend",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 5000
      }
    },
    {
      name: "bulsu-frontend",
      cwd: "C:\\Users\\aljur\\BulSU-Wifi-Management\\bulsu-wifi-frontend",
      script: "node_modules/vite/bin/vite.js",
      args: "--host",
      watch: false
    }
  ]
}

