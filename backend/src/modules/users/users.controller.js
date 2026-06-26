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
  const { sectorId, take: takeParam } = req.query
  const take = takeParam ? Math.min(Number(takeParam), 500) : 500
  const where = {}

  if (sectorId) {
    const sid = Number(sectorId)
    if (isNaN(sid)) return res.status(400).json({ error: 'sectorId inválido.' })
    where.OR = [
      { sectorId: sid },
      { userSectors: { some: { sectorId: sid } } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    select: USER_SAFE_SELECT,
    orderBy: { name: 'asc' },
    take,
  })
  res.json(users)
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

async function listUserSectors(req, res) {
  const id = Number(req.params.id)
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      sector: { select: { id: true, name: true } },
      userSectors: { include: { sector: { select: { id: true, name: true } } } },
    },
  })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
  res.json({
    primary: user.sector,
    sectors: user.userSectors.map(us => ({ id: us.sector.id, name: us.sector.name, type: us.type })),
  })
}

async function addUserSector(req, res) {
  const id = Number(req.params.id)
  const { sectorId, type } = req.body

  if (type !== 'member' && type !== 'extra') {
    return res.status(400).json({ error: 'type inválido.' })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

  const sector = await prisma.sector.findUnique({ where: { id: Number(sectorId) } })
  if (!sector) return res.status(422).json({ error: 'Setor não encontrado.' })

  if (user.sectorId === Number(sectorId)) {
    return res.status(409).json({ error: 'Este já é o setor principal do usuário.' })
  }

  const existing = await prisma.userSector.findUnique({
    where: { userId_sectorId: { userId: id, sectorId: Number(sectorId) } },
  })
  if (existing) return res.status(409).json({ error: 'Usuário já pertence a este setor.' })

  const userSector = await prisma.userSector.create({
    data: { userId: id, sectorId: Number(sectorId), type },
    include: { sector: { select: { id: true, name: true } } },
  })
  res.status(201).json(userSector)
}

async function updateUserSector(req, res) {
  const id = Number(req.params.id)
  const sid = Number(req.params.sid)
  const { type } = req.body

  if (type !== 'member' && type !== 'extra') {
    return res.status(400).json({ error: 'type inválido.' })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

  const link = await prisma.userSector.findUnique({
    where: { userId_sectorId: { userId: id, sectorId: sid } },
  })
  if (!link) return res.status(404).json({ error: 'Setor não encontrado para este usuário.' })

  const updated = await prisma.userSector.update({
    where: { userId_sectorId: { userId: id, sectorId: sid } },
    data: { type },
    include: { sector: { select: { id: true, name: true } } },
  })
  res.json(updated)
}

async function removeUserSector(req, res) {
  const id = Number(req.params.id)
  const sid = Number(req.params.sid)

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

  const link = await prisma.userSector.findUnique({
    where: { userId_sectorId: { userId: id, sectorId: sid } },
  })
  if (!link) return res.status(404).json({ error: 'Setor não encontrado para este usuário.' })

  await prisma.userSector.delete({
    where: { userId_sectorId: { userId: id, sectorId: sid } },
  })
  res.status(204).send()
}

module.exports = { list, create, update, listUserSectors, addUserSector, updateUserSector, removeUserSector };
