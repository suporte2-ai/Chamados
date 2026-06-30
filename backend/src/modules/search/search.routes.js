// backend/src/modules/search/search.routes.js
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const { search } = require('./search.controller');

const router = express.Router();

router.get('/search', asyncHandler(authenticate), asyncHandler(search));

module.exports = router;
