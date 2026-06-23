const prisma = require('../lib/prisma');
const { verifyAccessToken } = require('../lib/jwt');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token de acesso ausente.' });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Token de acesso inválido ou expirado.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: { include: { permissions: true, fieldVisibilities: true } } },
  });

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
  }

  req.user = {
    id: user.id,
    roleId: user.roleId,
    sectorId: user.sectorId,
    permissions: new Set(
      user.role.permissions.filter((permission) => permission.enabled).map((permission) => permission.permissionKey)
    ),
    fieldVisibilities: new Set(
      user.role.fieldVisibilities.filter((field) => field.visible).map((field) => field.fieldKey)
    ),
  };

  next();
}

module.exports = authenticate;
