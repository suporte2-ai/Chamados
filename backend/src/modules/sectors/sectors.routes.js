const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./sectors.controller');

const router = express.Router();

const auth = [asyncHandler(authenticate), requirePermission('manage_categories')];

router.get('/sectors', ...auth, asyncHandler(controller.list));
router.post('/sectors', ...auth, asyncHandler(controller.create));

module.exports = router;
