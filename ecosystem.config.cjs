module.exports = {
  apps: [{
    name: 'webapp',
    script: 'node',
    args: 'dist/index.js',
    watch: false,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: 'postgresql://postgres:jIkCfQdAoRxMySzwAjRdYKJbjqHyajof@switchback.proxy.rlwy.net:26320/railway'
    }
  }]
}
