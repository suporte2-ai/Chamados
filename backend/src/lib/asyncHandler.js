// Express 4 não encaminha promises rejeitadas de handlers async para o
// middleware de erro automaticamente. Este wrapper captura a rejeição e chama
// next(error), permitindo que o middleware de erro centralizado (em server.js)
// responda de forma consistente em vez da requisição ficar pendente.
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
