const prisma = require('../src/lib/prisma');

const createdRoleIds = [];
const createdSectorIds = [];
const createdUserIds = [];

afterAll(async () => {
  // PasswordResetToken/Notification cascade from User; RolePermission/RoleFieldVisibility cascade from Role.
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.sector.deleteMany({ where: { id: { in: createdSectorIds } } });
  await prisma.$disconnect();
});

test('creates a role with permissions and field visibility', async () => {
  const role = await prisma.role.create({
    data: {
      name: 'Role Teste Identity Tecnico',
      level: 2,
      permissions: {
        create: [{ permissionKey: 'view_internal_notes', enabled: true }],
      },
      fieldVisibilities: {
        create: [{ fieldKey: 'estimated_cost', visible: false }],
      },
    },
    include: { permissions: true, fieldVisibilities: true },
  });
  createdRoleIds.push(role.id);

  expect(role.permissions).toHaveLength(1);
  expect(role.fieldVisibilities[0].visible).toBe(false);
});

test('creates a sector and a user linked to a role and sector', async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Identity TI' } });
  const role = await prisma.role.create({ data: { name: 'Role Teste Identity UsuarioFinal', level: 1 } });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(role.id);

  const user = await prisma.user.create({
    data: {
      name: 'Maria Souza',
      email: 'maria@example.com',
      passwordHash: 'hashed-password',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(user.id);

  expect(user.active).toBe(true);
  expect(user.sectorId).toBe(sector.id);
});

test('enforces unique email on users', async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Identity RH' } });
  const role = await prisma.role.create({ data: { name: 'Role Teste Identity Gestor', level: 3 } });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(role.id);

  const user = await prisma.user.create({
    data: {
      name: 'Carlos Lima',
      email: 'duplicado@example.com',
      passwordHash: 'hash1',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(user.id);

  await expect(
    prisma.user.create({
      data: {
        name: 'Outro Usuário',
        email: 'duplicado@example.com',
        passwordHash: 'hash2',
        roleId: role.id,
        sectorId: sector.id,
      },
    })
  ).rejects.toThrow();
});

test('creates a password reset token for a user', async () => {
  const sector = await prisma.sector.create({ data: { name: 'Sector Teste Identity Financeiro' } });
  const role = await prisma.role.create({ data: { name: 'Role Teste Identity Admin', level: 4 } });
  createdSectorIds.push(sector.id);
  createdRoleIds.push(role.id);

  const user = await prisma.user.create({
    data: {
      name: 'Ana Paula',
      email: 'ana@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });
  createdUserIds.push(user.id);

  const token = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: 'reset-token-123',
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  expect(token.usedAt).toBeNull();
});
