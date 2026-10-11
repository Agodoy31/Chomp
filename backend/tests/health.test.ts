import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../src/app';

describe('GET /api/health', () => {
  it('should return 200 and status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.message).toBe('API is running');
  });
});
