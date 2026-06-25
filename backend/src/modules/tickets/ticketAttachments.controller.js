const prisma = require('../../lib/prisma');
const { ticketVisibilityWhere } = require('../../lib/ticketVisibility');

async function create(req, res) {
  const ticketId = Number(req.params.id);
  const { commentId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo é obrigatório (campo "file").' });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visible = await prisma.ticket.findFirst({ where: { id: ticketId, ...ticketVisibilityWhere(req.user) } });
  if (!visible) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      commentId: commentId ? Number(commentId) : null,
      fileName: req.file.originalname,
      filePath: req.file.path,
      uploadedById: req.user.id,
    },
  });
  res.status(201).json(attachment);
}

async function download(req, res) {
  const ticketId = Number(req.params.ticketId);
  const attachmentId = Number(req.params.attachmentId);

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' });
  }

  const visibleTicket = await prisma.ticket.findFirst({ where: { id: ticketId, ...ticketVisibilityWhere(req.user) } });
  if (!visibleTicket) {
    return res.status(403).json({ error: 'Você não tem acesso a este chamado.' });
  }

  const attachment = await prisma.ticketAttachment.findFirst({ where: { id: attachmentId, ticketId } });
  if (!attachment) {
    return res.status(404).json({ error: 'Anexo não encontrado.' });
  }

  res.download(attachment.filePath, attachment.fileName);
}

module.exports = { create, download };
