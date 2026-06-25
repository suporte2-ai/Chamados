const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./tickets.controller');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

router.post('/tickets', authenticated, asyncHandler(controller.create));
router.get('/tickets', authenticated, asyncHandler(controller.list));
router.get('/tickets/:id', authenticated, asyncHandler(controller.detail));

module.exports = router;
