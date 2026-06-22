const request = require('supertest');
const app = require('../src/server');

test('GET /health returns ok status', async () => {
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
