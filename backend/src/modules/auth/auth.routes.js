const express = require('express');
const authenticate = require('../../middleware/authenticate');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);
router.post('/forgot-password', controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);

module.exports = router;
