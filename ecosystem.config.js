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
        JWT_SECRET: 'UWGUY+LaISCfVBMBv0xFBacvxGNmQ4Y2CPokNDgHQ+X+KhqaIloqcLCgUVGcgesh',
        ENCRYPTION_KEY: 'C+EzH3ru3yMYAj5/GlMCOIvY4VvvfUzWtUzBwJ6qrXg=',
        AUTH_HMAC_SECRET: 'A+uh5SY19EHSwsPf9d6171KdxZBylAfOGRwk4pwbxw5pRr86LEq2G/65dPII4qvM',
        COOKIE_SECURE: 'false',
        SMS_API_KEY: '',
        CLIENT_URL: 'http://119.29.147.165:3001',
        GITHUB_CLIENT_ID: '',
        GITHUB_CLIENT_SECRET: '',
        GITHUB_CALLBACK_URL: 'http://119.29.147.165:8080/api/auth/github/callback',
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
