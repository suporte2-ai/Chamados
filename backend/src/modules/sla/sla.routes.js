const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./sla.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_sla'));

router.get('/sla-config', asyncHandler(controller.list));
router.patch('/sla-config/:urgency', asyncHandler(controller.update));

module.exports = router;
