module.exports = {
  apps: [
    {
      name: 'game-server',
      cwd: './server',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/gameplatform',
        JWT_SECRET: 'dev-secret-key-123',
        CLIENT_URL: 'http://119.29.147.165:3001',
      },
      max_memory_restart: '200M',
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'game-client',
      cwd: './client',
      script: 'node_modules/.bin/vite',
      args: '--host 0.0.0.0 --port 3001',
      env: {
        NODE_ENV: 'development',
      },
      max_memory_restart: '200M',
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
