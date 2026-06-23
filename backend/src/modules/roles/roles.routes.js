const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const controller = require('./roles.controller');

const router = express.Router();

router.use(authenticate, requirePermission('manage_users'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.patch('/:id/permissions', controller.updatePermissions);
router.patch('/:id/field-visibility', controller.updateFieldVisibility);

module.exports = router;
