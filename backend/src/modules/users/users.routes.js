const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./users.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_users'));

router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.patch('/:id', asyncHandler(controller.update));

router.get('/:id/sectors',         asyncHandler(controller.listUserSectors));
router.post('/:id/sectors',        asyncHandler(controller.addUserSector));
router.patch('/:id/sectors/:sid',  asyncHandler(controller.updateUserSector));
router.delete('/:id/sectors/:sid', asyncHandler(controller.removeUserSector));

module.exports = router;
