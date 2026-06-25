const prisma = require('../../lib/prisma');

async function list(req, res) {
  const categories = await prisma.category.findMany({
    include: { subcategories: true },
    orderBy: { id: 'asc' },
  });
  res.json(categories);
}

async function create(req, res) {
  const { name, subcategories } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const category = await prisma.category.create({
    data: {
      name,
      subcategories: Array.isArray(subcategories) ? { create: subcategories.map((s) => ({ name: s })) } : undefined,
    },
    include: { subcategories: true },
  });
  res.status(201).json(category);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name } = req.body;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const updated = await prisma.category.update({
    where: { id },
    data: name !== undefined ? { name } : {},
    include: { subcategories: true },
  });
  res.json(updated);
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const [subcategoryCount, ticketCount] = await Promise.all([
    prisma.subcategory.count({ where: { categoryId: id } }),
    prisma.ticket.count({ where: { categoryId: id } }),
  ]);
  if (subcategoryCount > 0 || ticketCount > 0) {
    return res.status(409).json({ error: 'Existem subcategorias ou chamados vinculados a esta categoria.' });
  }

  await prisma.category.delete({ where: { id } });
  res.status(204).send();
}

async function createSubcategory(req, res) {
  const categoryId = Number(req.params.id);
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name é obrigatório.' });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const subcategory = await prisma.subcategory.create({ data: { categoryId, name } });
  res.status(201).json(subcategory);
}

async function removeSubcategory(req, res) {
  const id = Number(req.params.id);

  const subcategory = await prisma.subcategory.findUnique({ where: { id } });
  if (!subcategory) {
    return res.status(404).json({ error: 'Subcategoria não encontrada.' });
  }

  const ticketCount = await prisma.ticket.count({ where: { subcategoryId: id } });
  if (ticketCount > 0) {
    return res.status(409).json({ error: 'Existem chamados vinculados a esta subcategoria.' });
  }

  await prisma.subcategory.delete({ where: { id } });
  res.status(204).send();
}

module.exports = { list, create, update, remove, createSubcategory, removeSubcategory };
