const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../../lib/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiresInMs } = require('../../lib/jwt');
const { getEnabledPermissionKeys, getVisibleFieldKeys } = require('../../lib/permissions');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

// Opções fixas do cookie de refresh: nenhum campo depende do request, então é
// montado uma única vez e reutilizado (em vez de recriado em cada chamada).
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: REFRESH_COOKIE_PATH,
  // maxAge deriva de JWT_REFRESH_EXPIRES (mesma env que assina o token), então
  // o cookie nunca fica fora de sincronia com a expiração real do JWT.
  maxAge: getRefreshTokenExpiresInMs(),
};

function profilePayloadFromUserWithRole(userWithRole) {
  const { role } = userWithRole;

  if (!role) {
    // Role referenciada pelo usuário não existe mais (ex.: deletada de forma concorrente).
    // Sinalizamos com um erro de domínio para que o handler responda 409, em vez de deixar
    // o TypeError de acessar propriedades de `null` estourar como 500 não tratado.
    const error = new Error(`Role ${userWithRole.roleId} not found for user ${userWithRole.id}.`);
    error.statusCode = 409;
    error.publicMessage = 'A função (role) do usuário não foi encontrada.';
    throw error;
  }

  return {
    user: {
      id: userWithRole.id,
      name: userWithRole.name,
      email: userWithRole.email,
      role: { id: role.id, name: role.name },
      sectorId: userWithRole.sectorId,
    },
    permissions: getEnabledPermissionKeys(role),
    fieldVisibilities: getVisibleFieldKeys(role),
  };
}

const PROFILE_ROLE_INCLUDE = { role: { include: { permissions: true, fieldVisibilities: true } } };

// Usado por login: o usuário já foi carregado (sem o role) para validar a senha;
// aqui buscamos apenas o role/permissions/fieldVisibilities, sem refazer o
// findUnique do usuário.
async function buildProfilePayload(user) {
  const role = await prisma.role.findUnique({
    where: { id: user.roleId },
    include: { permissions: true, fieldVisibilities: true },
  });
  return profilePayloadFromUserWithRole({ ...user, role });
}

// Incrementa refreshTokenVersion para o usuário — usado por logout/refresh/reset
// para invalidar o(s) refresh token(s) emitidos anteriormente.
function bumpRefreshTokenVersion(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { refreshTokenVersion: { increment: 1 } },
  });
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
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

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

  // updateMany com a versão esperada no `where` torna a checagem e o incremento
  // atômicos: sob concorrência, apenas uma requisição com o mesmo token consegue
  // casar `refreshTokenVersion: payload.ver` e de fato atualizar a linha — a
  // segunda chamada concorrente não encontra mais nenhuma linha para atualizar
  // (count === 0) e é rejeitada como reuso, em vez de também ter sucesso.
  const { count } = await prisma.user.updateMany({
    where: { id: payload.sub, active: true, refreshTokenVersion: payload.ver },
    data: { refreshTokenVersion: { increment: 1 } },
  });

  if (count === 0) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const updatedUser = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!updatedUser) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }

  const accessToken = signAccessToken(updatedUser.id);
  const newRefreshToken = signRefreshToken(updatedUser.id, updatedUser.refreshTokenVersion);
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({ accessToken });
}

async function logout(req, res) {
  await bumpRefreshTokenVersion(req.user.id);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).send();
}

async function me(req, res) {
  // Uma única consulta com include (em vez de buscar o usuário e, em seguida, buscar
  // o role separadamente) — reduz de 2 para 1 round trip nesta rota.
  const userWithRole = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: PROFILE_ROLE_INCLUDE,
  });
  if (!userWithRole) {
    return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
  }
  const profile = profilePayloadFromUserWithRole(userWithRole);
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

    // Invalida quaisquer tokens de reset anteriores ainda não usados deste usuário e cria
    // o novo na mesma transação, para que nunca existam múltiplos links de redefinição
    // válidos simultaneamente nem se perca a invalidação caso a criação falhe.
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, token: hashedToken, expiresAt },
      }),
    ]);

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
