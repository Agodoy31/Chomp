import fs from 'fs';
import path from 'path';

// This file runs before all test now and will check if there is a .env defined,
// if not it defines its own defaults
const envPath = path.resolve(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
  process.env.MONGO_URI = 'mongodb://localhost:27017/chomp';
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.PORT = '5000';
}
