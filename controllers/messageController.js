const asyncHandler = require('express-async-handler');
const Message = require('../models/Message');
const User = require('../models/User');
const Conversation = require('../models/Conversation');

/**
 * @desc    Send a message to another user
 * @route   POST /api/messages
 * @access  Private
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { receiver, content } = req.body;
  const sender = req.user._id;

  if (!receiver || !content) {
    res.status(400);
    throw new Error('Please provide a receiver and content');
  }

  // Check if the receiver exists
  const receiverUser = await User.findById(receiver);
  if (!receiverUser) {
    res.status(404);
    throw new Error('Receiver not found');
  }

  // For staff users, check if receiver is from the same hospital
  if (req.user.role === 'staff') {
    if (receiverUser.hospital.toString() !== req.user.hospital.toString()) {
      res.status(403);
      throw new Error('Staff can only message users from their own hospital');
    }
  }

  // Find or create conversation
  let conversation = await Conversation.findOne({
    participants: { $all: [sender, receiver] }
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [sender, receiver]
    });
  }

  // Create message
  const message = await Message.create({
    conversation: conversation._id,
    sender,
    receiver,
    content
  });

  // Populate sender information
  const populatedMessage = await Message.findById(message._id)
    .populate('sender', 'name role')
    .populate('receiver', 'name role');

  // Update conversation with last message
  conversation.lastMessage = {
    content,
    sender,
    timestamp: new Date()
  };
  conversation.updatedAt = new Date();
  
  // Increment unread count for receiver
  if (conversation.unreadCounts && conversation.unreadCounts[receiver]) {
    conversation.unreadCounts[receiver] += 1;
  } else {
    conversation.unreadCounts = {
      ...conversation.unreadCounts,
      [receiver]: 1
    };
  }
  
  await conversation.save();

  res.status(201).json(populatedMessage);
});

/**
 * @desc    Get messages with a specific user
 * @route   GET /api/messages/:userId
 * @access  Private
 */
const getMessages = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user._id;

  if (!userId) {
    res.status(400);
    throw new Error('User ID is required');
  }

  // Find conversation between current user and specified user
  const conversation = await Conversation.findOne({
    participants: { $all: [currentUser, userId] }
  });

  if (!conversation) {
    // No conversation found - return empty array instead of error
    return res.json([]);
  }

  // Get messages from this conversation
  const messages = await Message.find({ conversation: conversation._id })
    .populate('sender', 'name role')
    .populate('receiver', 'name role')
    .sort({ createdAt: 1 });

  // Mark messages as read where current user is receiver
  const unreadMessages = await Message.find({
    conversation: conversation._id,
    receiver: currentUser,
    read: false
  });

  if (unreadMessages.length > 0) {
    await Message.updateMany(
      {
        conversation: conversation._id,
        receiver: currentUser,
        read: false
      },
      { read: true }
    );

    // Reset unread count for current user
    if (conversation.unreadCounts && conversation.unreadCounts[currentUser]) {
      conversation.unreadCounts[currentUser] = 0;
      await conversation.save();
    }
  }

  res.json(messages);
});

/**
 * @desc    Get all conversations for the logged-in user
 * @route   GET /api/messages/conversations
 * @access  Private
 */
const getConversations = asyncHandler(async (req, res) => {
  const currentUser = req.user._id;
  const isAdmin = req.user.role === 'admin';

  // Find all conversations where the user is a participant
  const conversations = await Conversation.find({
    participants: currentUser
  }).sort({ updatedAt: -1 });

  // Format conversations for frontend
  const formattedConversations = await Promise.all(
    conversations.map(async (conversation) => {
      const otherParticipantId = conversation.participants.find(
        (p) => p.toString() !== currentUser.toString()
      );

      const otherParticipant = await User.findById(otherParticipantId).select('name email role hospital');

      if (!otherParticipant) {
        // Skip conversations with deleted users
        return null;
      }

      let result = {
        _id: conversation._id,
        participant: {
          _id: otherParticipant._id,
          name: otherParticipant.name,
          email: otherParticipant.email,
          role: otherParticipant.role
        },
        lastMessage: conversation.lastMessage,
        unreadCount: conversation.unreadCounts?.[currentUser] || 0,
        updatedAt: conversation.updatedAt
      };

      // For admin users, include hospital information
      if (isAdmin && otherParticipant.hospital) {
        const hospital = await require('../models/Hospital').findById(otherParticipant.hospital);
        if (hospital) {
          result.participant.hospitalId = hospital._id;
          result.participant.hospitalName = hospital.name;
        }
      }

      return result;
    })
  );

  // Remove null entries (conversations with deleted users)
  const validConversations = formattedConversations.filter(c => c !== null);

  res.json(validConversations);
});

/**
 * @desc    Get all users available for messaging
 * @route   GET /api/messages/users
 * @access  Private
 */
const getUsers = asyncHandler(async (req, res) => {
  const currentUser = req.user;
  const includeHospital = req.query.includeHospital === 'true';
  let query = { _id: { $ne: currentUser._id } };
  
  // For staff, only show users from the same hospital
  if (currentUser.role === 'staff') {
    query.hospital = currentUser.hospital;
  }
  // For doctors, show staff from their hospital and other doctors
  else if (currentUser.role === 'doctor') {
    query.$or = [
      { role: 'doctor' },
      { role: 'staff', hospital: currentUser.hospital },
      { role: 'admin' }
    ];
  }
  // For patients, show their doctors and staff from their hospital
  else if (currentUser.role === 'patient') {
    query.$or = [
      { role: 'doctor', hospital: currentUser.hospital },
      { role: 'staff', hospital: currentUser.hospital }
    ];
  }
  // Admin can see all users
  
  const users = await User.find(query).select('name email role hospital');
  
  // If includeHospital is true, populate hospital information
  if (includeHospital && currentUser.role === 'admin') {
    const Hospital = require('../models/Hospital');
    const usersWithHospital = await Promise.all(
      users.map(async (user) => {
        const userObj = user.toObject();
        if (user.hospital) {
          const hospital = await Hospital.findById(user.hospital);
          if (hospital) {
            userObj.hospitalName = hospital.name;
          }
        }
        return userObj;
      })
    );
    return res.json(usersWithHospital);
  }
  
  res.json(users);
});

/**
 * @desc    Mark a message as read
 * @route   PUT /api/messages/:messageId/read
 * @access  Private
 */
const markMessageAsRead = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const currentUser = req.user._id;

  const message = await Message.findById(messageId);

  if (!message) {
    res.status(404);
    throw new Error('Message not found');
  }

  // Ensure current user is the receiver
  if (message.receiver.toString() !== currentUser.toString()) {
    res.status(403);
    throw new Error('Not authorized to mark this message as read');
  }

  // Mark as read if not already
  if (!message.read) {
    message.read = true;
    await message.save();

    // Update conversation unread count
    const conversation = await Conversation.findById(message.conversation);
    if (conversation && conversation.unreadCounts && conversation.unreadCounts[currentUser]) {
      conversation.unreadCounts[currentUser] = Math.max(0, conversation.unreadCounts[currentUser] - 1);
      await conversation.save();
    }
  }

  res.json({ success: true });
});

module.exports = {
  sendMessage,
  getMessages,
  getConversations,
  getUsers,
  markMessageAsRead
}; 