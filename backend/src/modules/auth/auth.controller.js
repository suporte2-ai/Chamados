const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../../lib/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../lib/jwt');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

async function buildProfilePayload(user) {
  const role = await prisma.role.findUnique({
    where: { id: user.roleId },
    include: { permissions: true, fieldVisibilities: true },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: { id: role.id, name: role.name },
      sectorId: user.sectorId,
    },
    permissions: role.permissions.filter((permission) => permission.enabled).map((permission) => permission.permissionKey),
    fieldVisibilities: role.fieldVisibilities.map((field) => ({ fieldKey: field.fieldKey, visible: field.visible })),
  };
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Usuário desativado.' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, user.refreshTokenVersion);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

  const profile = await buildProfilePayload(user);
  res.json({ accessToken, ...profile });
}

async function refresh(req, res) {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Refresh token ausente.' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active || user.refreshTokenVersion !== payload.ver) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenVersion: { increment: 1 } },
  });

  const accessToken = signAccessToken(updatedUser.id);
  const newRefreshToken = signRefreshToken(updatedUser.id, updatedUser.refreshTokenVersion);
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions());

  res.json({ accessToken });
}

async function logout(req, res) {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshTokenVersion: { increment: 1 } },
  });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).send();
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const profile = await buildProfilePayload(user);
  res.json(profile);
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + Number(process.env.RESET_TOKEN_EXPIRES_HOURS || 1) * 60 * 60 * 1000
    );

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashedToken, expiresAt },
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${rawToken}`;
    console.log(`Link de redefinição de senha para ${email}: ${resetLink}`);
  }

  res.status(200).json({ message: 'Se o e-mail existir, um link de redefinição foi enviado.' });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: hashedToken } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Token inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, refreshTokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.status(200).json({ message: 'Senha redefinida com sucesso.' });
}

module.exports = { login, refresh, logout, me, forgotPassword, resetPassword };
