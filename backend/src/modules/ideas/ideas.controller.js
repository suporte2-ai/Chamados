const prisma = require('../../lib/prisma');
const { notifyIdeaStatusChanged, notifyIdeaVote } = require('../../lib/notificationService');

const IDEA_STATUSES = ['NOVA', 'EM_ANALISE', 'APROVADA', 'EM_IMPLEMENTACAO', 'IMPLEMENTADA', 'ARQUIVADA'];

const VALID_TRANSITIONS = {
  NOVA: ['EM_ANALISE', 'ARQUIVADA'],
  EM_ANALISE: ['APROVADA', 'ARQUIVADA'],
  APROVADA: ['EM_IMPLEMENTACAO', 'ARQUIVADA'],
  EM_IMPLEMENTACAO: ['IMPLEMENTADA', 'ARQUIVADA'],
};

function visibilityWhere(user) {
  if (user.permissions.has('manage_ideas')) return {};
  return { OR: [{ authorId: user.id }, { status: { not: 'NOVA' } }] };
}

function serialize(idea, userId, hasManageIdeas) {
  const showAuthor = !idea.isAnonymous || hasManageIdeas;
  return {
    id: idea.id,
    title: idea.title,
    description: idea.description,
    areaImpacted: idea.areaImpacted,
    expectedBenefit: idea.expectedBenefit,
    isAnonymous: idea.isAnonymous,
    status: idea.status,
    managerNote: idea.managerNote ?? null,
    authorId: showAuthor ? idea.authorId : null,
    authorName: showAuthor ? (idea.author?.name ?? null) : null,
    voteCount: idea._count?.votes ?? 0,
    userHasVoted: Array.isArray(idea.votes) ? idea.votes.some((v) => v.userId === userId) : false,
    createdAt: idea.createdAt,
  };
}

const ideaInclude = (userId) => ({
  author: { select: { name: true } },
  _count: { select: { votes: true } },
  votes: { where: { userId }, select: { userId: true } },
});

async function create(req, res) {
  const { title, description, areaImpacted, expectedBenefit, isAnonymous } = req.body;
  if (!title || !description || !areaImpacted || !expectedBenefit) {
    return res.status(400).json({ error: 'title, description, areaImpacted e expectedBenefit são obrigatórios.' });
  }

  const idea = await prisma.idea.create({
    data: {
      title,
      description,
      areaImpacted,
      expectedBenefit,
      isAnonymous: Boolean(isAnonymous),
      authorId: req.user.id,
    },
    include: ideaInclude(req.user.id),
  });

  res.status(201).json(serialize(idea, req.user.id, req.user.permissions.has('manage_ideas')));
}

async function list(req, res) {
  const { status } = req.query;
  if (status && !IDEA_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Valores aceitos: ${IDEA_STATUSES.join(', ')}.` });
  }

  const where = {
    ...visibilityWhere(req.user),
    ...(status ? { status } : {}),
  };

  const ideas = await prisma.idea.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: ideaInclude(req.user.id),
  });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  res.json(ideas.map((i) => serialize(i, req.user.id, hasManageIdeas)));
}

async function detail(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const idea = await prisma.idea.findUnique({
    where: { id },
    include: ideaInclude(req.user.id),
  });

  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (idea.status === 'NOVA' && idea.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const comments = await prisma.ideaComment.findMany({
    where: { ideaId: id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true } } },
  });

  res.json({ ...serialize(idea, req.user.id, hasManageIdeas), comments });
}

async function updateStatus(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const { status, managerNote } = req.body;
  if (!status) return res.status(400).json({ error: 'O campo status é obrigatório.' });
  if (!IDEA_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Valores aceitos: ${IDEA_STATUSES.join(', ')}.` });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const allowed = VALID_TRANSITIONS[idea.status] ?? [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Transição de status não permitida: ${idea.status} → ${status}.` });
  }

  const updated = await prisma.idea.update({
    where: { id },
    data: { status, ...(managerNote !== undefined ? { managerNote } : {}) },
    include: ideaInclude(req.user.id),
  });

  await notifyIdeaStatusChanged(idea.authorId, updated);
  res.json(serialize(updated, req.user.id, true));
}

async function toggleVote(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (idea.status === 'NOVA' && idea.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  if (idea.status !== 'EM_ANALISE') {
    return res.status(400).json({ error: 'Só é possível votar em ideias em análise.' });
  }

  const existing = await prisma.ideaVote.findUnique({
    where: { ideaId_userId: { ideaId: id, userId: req.user.id } },
  });

  if (existing) {
    await prisma.ideaVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.ideaVote.create({ data: { ideaId: id, userId: req.user.id } });
  }

  const updated = await prisma.idea.findUnique({
    where: { id },
    include: { _count: { select: { votes: true } } },
  });
  const voteCount = updated._count.votes;
  if (!existing) {
    await notifyIdeaVote(idea.authorId, req.user.id, idea);
  }
  res.json({ voted: !existing, voteCount });
}

async function addComment(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'body é obrigatório.' });
  }

  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return res.status(404).json({ error: 'Ideia não encontrada.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (idea.status === 'NOVA' && idea.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const comment = await prisma.ideaComment.create({
    data: { ideaId: id, authorId: req.user.id, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  res.status(201).json(comment);
}

async function deleteComment(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id deve ser um número inteiro positivo.' });
  }

  const cid = Number(req.params.cid);
  if (!Number.isInteger(cid) || cid <= 0) {
    return res.status(400).json({ error: 'cid deve ser um número inteiro positivo.' });
  }

  const comment = await prisma.ideaComment.findUnique({ where: { id: cid } });
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });

  if (comment.ideaId !== id) return res.status(404).json({ error: 'Comentário não encontrado.' });

  const hasManageIdeas = req.user.permissions.has('manage_ideas');
  if (comment.authorId !== req.user.id && !hasManageIdeas) {
    return res.status(403).json({ error: 'Você não pode excluir este comentário.' });
  }

  await prisma.ideaComment.delete({ where: { id: cid } });
  res.status(204).send();
}

module.exports = { create, list, detail, updateStatus, toggleVote, addComment, deleteComment };
