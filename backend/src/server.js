require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const permissionsRoutes = require('./modules/permissions/permissions.routes');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);

// Middleware de erro centralizado: captura qualquer erro encaminhado via next(error)
// (incluindo promises rejeitadas de handlers async, via asyncHandler) e garante que
// toda requisição sempre recebe uma resposta, em vez de ficar pendente até timeout.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error && error.code === 'ROLE_NOT_FOUND') {
    return res.status(409).json({ error: 'A função (role) do usuário não foi encontrada.' });
  }

  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
