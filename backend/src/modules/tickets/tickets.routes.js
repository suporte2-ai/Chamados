const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./tickets.controller');
const commentsController = require('./ticketComments.controller');
const attachmentsController = require('./ticketAttachments.controller');
const { upload } = require('../../lib/uploadStorage');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

router.post('/tickets', authenticated, asyncHandler(controller.create));
router.get('/tickets', authenticated, asyncHandler(controller.list));
router.get('/tickets/:id', authenticated, asyncHandler(controller.detail));
router.patch('/tickets/:id', authenticated, asyncHandler(controller.update));
router.post('/tickets/:id/reopen', authenticated, asyncHandler(controller.reopen));
router.post('/tickets/:id/comments', authenticated, asyncHandler(commentsController.create));
router.post('/tickets/:id/attachments', authenticated, upload.single('file'), asyncHandler(attachmentsController.create));
router.get('/tickets/:ticketId/attachments/:attachmentId', authenticated, asyncHandler(attachmentsController.download));

module.exports = router;
