const prisma = require('../../lib/prisma');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../../lib/permissions');

async function list(req, res) {
  const roles = await prisma.role.findMany({
    include: { permissions: true, fieldVisibilities: true },
    orderBy: { id: 'asc' },
  });
  res.json(roles);
}

async function create(req, res) {
  const { name, level } = req.body;
  if (!name || level === undefined) {
    return res.status(400).json({ error: 'name e level são obrigatórios.' });
  }
  const role = await prisma.role.create({ data: { name, level } });
  res.status(201).json(role);
}

async function update(req, res) {
  const id = Number(req.params.id);
  const { name, level } = req.body;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return res.status(404).json({ error: 'Role não encontrada.' });
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (level !== undefined) data.level = level;

  const updated = await prisma.role.update({ where: { id }, data });
  res.json(updated);
}

async function remove(req, res) {
  const id = Number(req.params.id);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return res.status(404).json({ error: 'Role não encontrada.' });
  }
  if (role.isSystemDefault) {
    return res.status(409).json({ error: 'Não é possível excluir um perfil padrão do sistema.' });
  }

  const usersWithRole = await prisma.user.count({ where: { roleId: id } });
  if (usersWithRole > 0) {
    return res.status(409).json({ error: 'Existem usuários vinculados a este perfil.' });
  }

  await prisma.role.delete({ where: { id } });
  res.status(204).send();
}

async function updatePermissions(req, res) {
  const id = Number(req.params.id);
  const updates = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Corpo deve ser um array de { permissionKey, enabled }.' });
  }
  for (const update of updates) {
    if (!PERMISSION_KEYS.includes(update.permissionKey)) {
      return res.status(400).json({ error: `permissionKey inválido: ${update.permissionKey}` });
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: id, permissionKey: update.permissionKey } },
        update: { enabled: update.enabled },
        create: { roleId: id, permissionKey: update.permissionKey, enabled: update.enabled },
      })
    )
  );

  const permissions = await prisma.rolePermission.findMany({ where: { roleId: id } });
  res.json(permissions);
}

async function updateFieldVisibility(req, res) {
  const id = Number(req.params.id);
  const updates = req.body;

  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Corpo deve ser um array de { fieldKey, visible }.' });
  }
  for (const update of updates) {
    if (!FIELD_KEYS.includes(update.fieldKey)) {
      return res.status(400).json({ error: `fieldKey inválido: ${update.fieldKey}` });
    }
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.roleFieldVisibility.upsert({
        where: { roleId_fieldKey: { roleId: id, fieldKey: update.fieldKey } },
        update: { visible: update.visible },
        create: { roleId: id, fieldKey: update.fieldKey, visible: update.visible },
      })
    )
  );

  const fieldVisibilities = await prisma.roleFieldVisibility.findMany({ where: { roleId: id } });
  res.json(fieldVisibilities);
}

module.exports = { list, create, update, remove, updatePermissions, updateFieldVisibility };
