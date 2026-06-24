const express = require('express');
const request = require('supertest');
const errorHandler = require('../src/middleware/errorHandler');

function buildApp(thrownError) {
  const app = express();
  app.get('/boom', () => {
    throw thrownError;
  });
  app.use(errorHandler);
  return app;
}

test('responds with the error statusCode and publicMessage when set', async () => {
  const error = new Error('internal detail');
  error.statusCode = 409;
  error.publicMessage = 'Conflito de domínio.';
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(buildApp(error)).get('/boom');

  expect(response.status).toBe(409);
  expect(response.body.error).toBe('Conflito de domínio.');

  consoleErrorSpy.mockRestore();
});

test('falls back to 500 with a generic message when the error has no statusCode', async () => {
  const error = new Error('unexpected failure');
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(buildApp(error)).get('/boom');

  expect(response.status).toBe(500);
  expect(response.body.error).toBe('Erro interno do servidor.');
  expect(consoleErrorSpy).toHaveBeenCalledWith(error);

  consoleErrorSpy.mockRestore();
});
