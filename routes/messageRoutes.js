const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getMessages,
  getConversations,
  getUsers,
  markMessageAsRead
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// Send a message
router.post('/', sendMessage);

// Get all conversations for the logged-in user
router.get('/conversations', getConversations);

// Get all users available for messaging
router.get('/users', getUsers);

// Get messages for a specific conversation
router.get('/:userId', getMessages);

// Mark a message as read
router.put('/:messageId/read', markMessageAsRead);

module.exports = router;
