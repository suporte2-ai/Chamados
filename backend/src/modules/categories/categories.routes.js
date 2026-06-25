const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./categories.controller');

const router = express.Router();

router.use(asyncHandler(authenticate), requirePermission('manage_categories'));

router.get('/categories', asyncHandler(controller.list));
router.post('/categories', asyncHandler(controller.create));
router.patch('/categories/:id', asyncHandler(controller.update));
router.delete('/categories/:id', asyncHandler(controller.remove));
router.post('/categories/:id/subcategories', asyncHandler(controller.createSubcategory));
router.delete('/subcategories/:id', asyncHandler(controller.removeSubcategory));

module.exports = router;
