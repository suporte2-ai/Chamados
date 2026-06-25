const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./categories.controller');

const router = express.Router();

const auth = [asyncHandler(authenticate), requirePermission('manage_categories')];

router.get('/categories', ...auth, asyncHandler(controller.list));
router.post('/categories', ...auth, asyncHandler(controller.create));
router.patch('/categories/:id', ...auth, asyncHandler(controller.update));
router.delete('/categories/:id', ...auth, asyncHandler(controller.remove));
router.post('/categories/:id/subcategories', ...auth, asyncHandler(controller.createSubcategory));
router.delete('/subcategories/:id', ...auth, asyncHandler(controller.removeSubcategory));

module.exports = router;
