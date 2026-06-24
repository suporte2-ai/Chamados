// Middleware de erro centralizado: captura qualquer erro encaminhado via next(error)
// (incluindo promises rejeitadas de handlers async, via asyncHandler) e garante que
// toda requisição sempre recebe uma resposta, em vez de ficar pendente até timeout.
// Erros de domínio sinalizam seu próprio status/mensagem via error.statusCode/publicMessage,
// em vez de cada um exigir um novo "if" aqui.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({ error: error.publicMessage });
  }

  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}

module.exports = errorHandler;
