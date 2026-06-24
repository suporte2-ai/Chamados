const express = require('express');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../lib/asyncHandler');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../../lib/permissions');

const router = express.Router();

router.get('/catalog', asyncHandler(authenticate), (req, res) => {
  res.json({ permissionKeys: PERMISSION_KEYS, fieldKeys: FIELD_KEYS });
});

module.exports = router;
