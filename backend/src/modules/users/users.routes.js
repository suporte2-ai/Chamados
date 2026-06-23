const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const controller = require('./users.controller');

const router = express.Router();

router.use(authenticate, requirePermission('manage_users'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);

module.exports = router;
