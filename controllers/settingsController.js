const Settings = require('../models/Settings');
const asyncHandler = require('express-async-handler');

// @desc    Get settings
// @route   GET /api/admin/settings
// @access  Private/Admin
const getSettings = asyncHandler(async (req, res) => {
  console.log('Getting settings...');
  
  let settings = await Settings.findOne();
  
  if (!settings) {
    console.log('No settings found, creating default...');
    settings = await Settings.create({});
  }
  
  res.json(settings);
});

// @desc    Update settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
const updateSettings = asyncHandler(async (req, res) => {
  console.log('Updating settings with:', req.body);
  
  const {
    hospitalName,
    email,
    phone,
    emailNotifications,
    smsNotifications,
    timezone,
    dateFormat,
    language
  } = req.body;

  let settings = await Settings.findOne();

  if (!settings) {
    settings = await Settings.create({
      hospitalName,
      email,
      phone,
      emailNotifications,
      smsNotifications,
      timezone,
      dateFormat,
      language
    });
  } else {
    settings.hospitalName = hospitalName || settings.hospitalName;
    settings.email = email || settings.email;
    settings.phone = phone || settings.phone;
    settings.emailNotifications = emailNotifications !== undefined ? emailNotifications : settings.emailNotifications;
    settings.smsNotifications = smsNotifications !== undefined ? smsNotifications : settings.smsNotifications;
    settings.timezone = timezone || settings.timezone;
    settings.dateFormat = dateFormat || settings.dateFormat;
    settings.language = language || settings.language;

    await settings.save();
  }

  res.json(settings);
});

module.exports = {
  getSettings,
  updateSettings
}; 