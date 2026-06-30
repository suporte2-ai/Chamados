require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const permissionsRoutes = require('./modules/permissions/permissions.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const slaRoutes = require('./modules/sla/sla.routes');
const sectorsRoutes = require('./modules/sectors/sectors.routes');
const ticketsRoutes = require('./modules/tickets/tickets.routes');
const performanceRoutes = require('./modules/performance/performance.routes');
const ideasRoutes = require('./modules/ideas/ideas.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const eventsRoutes = require('./modules/events/events.routes');
const searchRoutes = require('./modules/search/search.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

if (process.env.NODE_ENV === 'production') {
  const origin = process.env.CORS_ORIGIN;
  if (!origin) {
    console.warn('[WARN] CORS_ORIGIN is not set in production — only http://localhost:5173 will be allowed.');
  } else if (origin === '*') {
    throw new Error('CORS_ORIGIN=* with credentials:true is not allowed in production.');
  }
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
// Strict headers on uploaded files: prevent the browser from executing scripts
// embedded in a crafted image by blocking all active content on this origin path.
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, '..', '..', 'uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', slaRoutes);
app.use('/api', sectorsRoutes);
app.use('/api', ticketsRoutes);
app.use('/api', performanceRoutes);
app.use('/api', ideasRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', eventsRoutes);
app.use('/api', searchRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
  require('./lib/eventNotificationCron').start();
}

module.exports = app;
