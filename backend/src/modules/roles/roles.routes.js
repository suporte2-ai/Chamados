const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./roles.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_users'));

router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.patch('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));
router.patch('/:id/permissions', asyncHandler(controller.updatePermissions));
router.patch('/:id/field-visibility', asyncHandler(controller.updateFieldVisibility));

module.exports = router;
