const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./auth.controller');

const router = express.Router();
const authenticated = asyncHandler(authenticate);

router.post('/login', asyncHandler(controller.login));
router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', authenticated, asyncHandler(controller.logout));
router.get('/me', authenticated, asyncHandler(controller.me));
router.post('/forgot-password', asyncHandler(controller.forgotPassword));
router.post('/reset-password', asyncHandler(controller.resetPassword));
router.patch('/me', authenticated, asyncHandler(controller.updateMe));
router.post('/request-email-change', authenticated, asyncHandler(controller.requestEmailChange));
router.get('/confirm-email-change/:token', asyncHandler(controller.confirmEmailChange));

module.exports = router;
