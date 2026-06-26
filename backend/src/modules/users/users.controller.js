const bcrypt = require('bcrypt');
const prisma = require('../../lib/prisma');

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  roleId: true,
  sectorId: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
  sector: { select: { id: true, name: true } },
};

async function list(req, res) {
  const take = req.query.take ? Math.min(Number(req.query.take), 500) : 500;
  const users = await prisma.user.findMany({
    select: USER_SAFE_SELECT,
    orderBy: { name: 'asc' },
    take,
  });
  res.json(users);
}

async function create(req, res) {
  const { name, email, password, roleId, sectorId } = req.body;
  if (!name || !email || !password || !roleId || !sectorId) {
    return res.status(400).json({ error: 'name, email, password, roleId e sectorId são obrigatórios.' });
  }

  const [role, sector, existing] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId } }),
    prisma.sector.findUnique({ where: { id: sectorId } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (!role || !sector) {
    return res.status(400).json({ error: 'roleId ou sectorId inválido.' });
  }
  if (existing) {
    return res.status(409).json({ error: 'E-mail já está em uso.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, roleId, sectorId },
    select: USER_SAFE_SELECT,
  });
  res.status(201).json(user);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name, email, roleId, sectorId, active } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (roleId !== undefined) data.roleId = roleId;
  if (sectorId !== undefined) data.sectorId = sectorId;
  if (active !== undefined) data.active = active;

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SAFE_SELECT,
  });
  res.json(updated);
}

module.exports = { list, create, update };
