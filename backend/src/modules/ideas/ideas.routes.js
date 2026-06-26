const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./ideas.controller');

const router = express.Router();

const authenticated = asyncHandler(authenticate);
const auth = [asyncHandler(authenticate), requirePermission('manage_ideas')];

router.post('/ideas', authenticated, asyncHandler(controller.create));
router.get('/ideas', authenticated, asyncHandler(controller.list));
router.get('/ideas/:id', authenticated, asyncHandler(controller.detail));
router.patch('/ideas/:id/status', ...auth, asyncHandler(controller.updateStatus));
router.post('/ideas/:id/vote', authenticated, asyncHandler(controller.toggleVote));

router.post('/ideas/:id/comments', authenticated, asyncHandler(controller.addComment));
router.delete('/ideas/:id/comments/:cid', authenticated, asyncHandler(controller.deleteComment));

module.exports = router;
