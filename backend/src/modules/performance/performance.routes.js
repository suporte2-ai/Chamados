const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./performance.controller');

const router = express.Router();

const auth = [asyncHandler(authenticate), requirePermission('view_performance_panel')];

router.get('/performance/summary', ...auth, asyncHandler(controller.summary));
router.get('/performance/users/:id/drilldown', ...auth, asyncHandler(controller.drilldown));
router.get('/performance/export', ...auth, asyncHandler(controller.exportData));

module.exports = router;
