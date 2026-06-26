const prisma = require('../../lib/prisma');

async function list(req, res) {
  const sectors = await prisma.sector.findMany({ orderBy: { id: 'asc' } });
  res.json(sectors);
}

async function create(req, res) {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const existing = await prisma.sector.findUnique({ where: { name } });
  if (existing) {
    return res.status(409).json({ error: 'Já existe um setor com esse nome.' });
  }

  const sector = await prisma.sector.create({ data: { name } });
  res.status(201).json(sector);
}

async function listSectorUsers(req, res) {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido.' })
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { sectorId: id },
        { userSectors: { some: { sectorId: id } } },
      ],
    },
    select: { id: true, name: true, email: true, sectorId: true },
    orderBy: { name: 'asc' },
  })
  res.json(users)
}

module.exports = { list, create, listSectorUsers };
