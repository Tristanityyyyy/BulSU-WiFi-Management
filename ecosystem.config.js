module.exports = {
  apps: [
    {
      name: "bulsu-backend",
      cwd: "C:\\Users\\tristan\\bulsu-wifi-system\\bulsu-wifi-backend",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 5000
      }
    },
    {
      name: "bulsu-frontend",
      cwd: "C:\\Users\\tristan\\bulsu-wifi-system\\bulsu-wifi-frontend",
      script: "node_modules/vite/bin/vite.js",
      args: "--host",
      watch: false
    }
  ]
}