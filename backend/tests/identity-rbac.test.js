const prisma = require('../src/lib/prisma');

afterAll(async () => {
  await prisma.rolePermission.deleteMany();
  await prisma.roleFieldVisibility.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.role.deleteMany();
  await prisma.$disconnect();
});

test('creates a role with permissions and field visibility', async () => {
  const role = await prisma.role.create({
    data: {
      name: 'Técnico/Atendente',
      level: 3,
      permissions: {
        create: [{ permissionKey: 'view_internal_notes', enabled: true }],
      },
      fieldVisibilities: {
        create: [{ fieldKey: 'estimated_cost', visible: false }],
      },
    },
    include: { permissions: true, fieldVisibilities: true },
  });

  expect(role.permissions).toHaveLength(1);
  expect(role.fieldVisibilities[0].visible).toBe(false);
});

test('creates a sector and a user linked to a role and sector', async () => {
  const sector = await prisma.sector.create({ data: { name: 'TI' } });
  const role = await prisma.role.create({ data: { name: 'Usuário Final', level: 1 } });

  const user = await prisma.user.create({
    data: {
      name: 'Maria Souza',
      email: 'maria@example.com',
      passwordHash: 'hashed-password',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  expect(user.active).toBe(true);
  expect(user.sectorId).toBe(sector.id);
});

test('enforces unique email on users', async () => {
  const sector = await prisma.sector.create({ data: { name: 'RH' } });
  const role = await prisma.role.create({ data: { name: 'Gestor', level: 2 } });

  await prisma.user.create({
    data: {
      name: 'Carlos Lima',
      email: 'duplicado@example.com',
      passwordHash: 'hash1',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

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
  const sector = await prisma.sector.create({ data: { name: 'Financeiro' } });
  const role = await prisma.role.create({ data: { name: 'Administrador', level: 4 } });
  const user = await prisma.user.create({
    data: {
      name: 'Ana Paula',
      email: 'ana@example.com',
      passwordHash: 'hash',
      roleId: role.id,
      sectorId: sector.id,
    },
  });

  const token = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: 'reset-token-123',
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  expect(token.usedAt).toBeNull();
});
