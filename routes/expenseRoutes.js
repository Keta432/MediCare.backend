const express = require('express');
const router = express.Router();
const {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
} = require('../controllers/expenseController');
const { protect, staffOrAdmin } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

// Apply authentication middleware to all routes
router.use(protect);

// Get expense statistics
router.route('/stats').get(staffOrAdmin, getExpenseStats);

// Get all expenses with filters or create new expense
router.route('/')
  .get(staffOrAdmin, getExpenses)
  .post(staffOrAdmin, upload.array('files', 10), createExpense);

// Get, update, or delete specific expense by id
router.route('/:id')
  .get(staffOrAdmin, getExpenseById)
  .put(staffOrAdmin, upload.array('files', 10), updateExpense)
  .delete(staffOrAdmin, deleteExpense);

module.exports = router;