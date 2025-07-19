const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect); // Apply protection to all routes
router.use(adminOnly); // Ensure user is admin

router.route('/')
  .get(getSettings)
  .put(updateSettings);

module.exports = router; 