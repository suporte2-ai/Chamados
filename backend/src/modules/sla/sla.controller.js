const prisma = require('../../lib/prisma');

const VALID_URGENCIES = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'];

async function list(req, res) {
  const configs = await prisma.slaConfig.findMany({ orderBy: { id: 'asc' } });
  res.json(configs);
}

async function update(req, res) {
  const { urgency } = req.params;
  if (!VALID_URGENCIES.includes(urgency)) {
    return res.status(400).json({ error: `urgency inválido: ${urgency}` });
  }

  const { firstResponseHours, resolutionHours } = req.body;
  const data = {};
  if (firstResponseHours !== undefined) data.firstResponseHours = firstResponseHours;
  if (resolutionHours !== undefined) data.resolutionHours = resolutionHours;

  const config = await prisma.slaConfig.upsert({
    where: { urgency },
    update: data,
    create: {
      urgency,
      firstResponseHours: firstResponseHours ?? 8,
      resolutionHours: resolutionHours ?? 72,
    },
  });
  res.json(config);
}

module.exports = { list, update };
