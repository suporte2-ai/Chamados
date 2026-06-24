require('dotenv').config();
const jwt = require('jsonwebtoken');
const ms = require('ms');

const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES || '7d';

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function signRefreshToken(userId, version) {
  return jwt.sign({ sub: userId, ver: version }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// Mesma duração configurada para o refresh token, em milissegundos — usada para
// que o maxAge do cookie nunca fique fora de sincronia com a expiração real do JWT.
function getRefreshTokenExpiresInMs() {
  return ms(REFRESH_TOKEN_EXPIRES_IN);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiresInMs,
};
