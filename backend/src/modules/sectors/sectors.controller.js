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

module.exports = { list, create };
