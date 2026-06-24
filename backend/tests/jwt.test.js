require('dotenv').config();
const {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiresInMs,
} = require('../src/lib/jwt');

test('signs and verifies an access token', () => {
  const token = signAccessToken(42);
  const payload = verifyAccessToken(token);
  expect(payload.sub).toBe(42);
});

test('signs and verifies a refresh token carrying a version claim', () => {
  const token = signRefreshToken(42, 3);
  const payload = verifyRefreshToken(token);
  expect(payload.sub).toBe(42);
  expect(payload.ver).toBe(3);
});

test('rejects a tampered access token', () => {
  const token = signAccessToken(42);
  expect(() => verifyAccessToken(`${token}x`)).toThrow();
});

test('rejects an access token verified as a refresh token', () => {
  const token = signAccessToken(42);
  expect(() => verifyRefreshToken(token)).toThrow();
});

test('getRefreshTokenExpiresInMs matches the default 7d refresh expiry', () => {
  expect(getRefreshTokenExpiresInMs()).toBe(7 * 24 * 60 * 60 * 1000);
});
