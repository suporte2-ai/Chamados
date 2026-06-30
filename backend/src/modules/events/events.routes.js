const express = require('express');
const authenticate = require('../../middleware/authenticate');
const requirePermission = require('../../middleware/requirePermission');
const asyncHandler = require('../../lib/asyncHandler');
const controller = require('./events.controller');

const router = express.Router();

const authenticated  = asyncHandler(authenticate);
const manageEvents   = [asyncHandler(authenticate), requirePermission('manage_events')];

router.get('/events/lookup/sectors', ...manageEvents, asyncHandler(controller.listLookupSectors));
router.get('/events/lookup/users',   ...manageEvents, asyncHandler(controller.listLookupUsers));
router.post('/events',               ...manageEvents, asyncHandler(controller.create));
router.get('/events',                authenticated,   asyncHandler(controller.list));
router.get('/events/:id',            authenticated,   asyncHandler(controller.detail));
router.patch('/events/:id',          ...manageEvents, asyncHandler(controller.update));
router.delete('/events/:id',         ...manageEvents, asyncHandler(controller.remove));
router.patch('/events/:id/rsvp',     authenticated,   asyncHandler(controller.updateRsvp));

module.exports = router;
