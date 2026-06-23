const express = require('express');
const authenticate = require('../../middleware/authenticate');
const { PERMISSION_KEYS, FIELD_KEYS } = require('../../lib/permissions');

const router = express.Router();

router.get('/catalog', authenticate, (req, res) => {
  res.json({ permissionKeys: PERMISSION_KEYS, fieldKeys: FIELD_KEYS });
});

module.exports = router;
