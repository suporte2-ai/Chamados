const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./notifications.controller');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

// SSE stream — must come before /:id routes
router.get('/notifications/stream', authenticated, controller.stream);

// read-all MUST come before /:id/read — otherwise Express matches 'read-all' as :id
router.get('/notifications', authenticated, asyncHandler(controller.list));
router.patch('/notifications/read-all', authenticated, asyncHandler(controller.markAllRead));
router.patch('/notifications/:id/read', authenticated, asyncHandler(controller.markRead));

module.exports = router;
