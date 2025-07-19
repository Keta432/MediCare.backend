const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const User = require('../models/User');
const Staff = require('../models/Staff');
const asyncHandler = require('express-async-handler');
const ActivityService = require('../utils/activityService');
const { deleteFileSafely } = require('../utils/fileHelper');

/**
 * @desc    Get all expenses with optional filtering
 * @route   GET /api/expenses
 * @access  Private (Staff, Admin)
 */   
const getExpenses = asyncHandler(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    category, 
    minAmount, 
    maxAmount, 
    sortBy = 'date',
    sortOrder = 'desc',
    limit = 100,
    hospital,
    status,
    hospitalId
  } = req.query;

  // Base query
  const query = {};

  // Get hospital ID from staff user
  if (req.user.role === 'staff') {
    // First check if a specific hospitalId was passed in the query
    if (hospitalId) {
      query.hospitalId = hospitalId;
    } else {
      // Otherwise use the staff's assigned hospital
      const staff = await Staff.findOne({ userId: req.user._id });
      if (staff && staff.hospital) {
        query.hospitalId = staff.hospital;
      }
    }
  } else if (req.user.role === 'admin') {
    // For admin users, apply hospital filter if provided
    if (hospital && hospital !== 'all') {
      query.hospitalId = hospital;
    }
    // Apply status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }
  } else if (hospitalId) {
    // For other roles, respect hospitalId if provided
    query.hospitalId = hospitalId;
  }

  // Apply date filters
  if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      query.date.$gte = new Date(startDate);
    }
    if (endDate) {
      // Add one day to include the end date in results
      const endDateObj = new Date(endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      query.date.$lt = endDateObj;
    }
  }

  // Apply category filter
  if (category && category !== 'all') {
    query.category = category;
  }

  // Apply amount filters
  if (minAmount || maxAmount) {
    query.amount = {};
    if (minAmount) {
      query.amount.$gte = Number(minAmount);
    }
    if (maxAmount) {
      query.amount.$lte = Number(maxAmount);
    }
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute query with pagination
  const expenses = await Expense.find(query)
    .sort(sort)
    .limit(Number(limit))
    .populate('createdBy', 'name')
    .populate('hospitalId', 'name');

  // Format expenses with hospital name included
  const formattedExpenses = expenses.map(expense => {
    const expenseObj = expense.toObject();
    if (expense.hospitalId && typeof expense.hospitalId === 'object') {
      expenseObj.hospitalName = expense.hospitalId.name;
    }
    return expenseObj;
  });

  // Get total count (for pagination)
  const total = await Expense.countDocuments(query);

  if (req.user.role === 'admin') {
    // For admin, send the formatted list with hospital names
    return res.status(200).json(formattedExpenses);
  }

  res.status(200).json({
    expenses,
    total,
    filters: {
      startDate,
      endDate,
      category,
      minAmount,
      maxAmount
    }
  });
});

/**
 * @desc    Get single expense by ID
 * @route   GET /api/expenses/:id
 * @access  Private (Staff, Admin)
 */
const getExpenseById = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate('createdBy', 'name')
    .populate('hospitalId', 'name');

  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }

  // Check authorization
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ userId: req.user._id });
    if (!staff || String(staff.hospital) !== String(expense.hospitalId._id)) {
      res.status(403);
      throw new Error('Not authorized to access this expense');
    }
  }

  res.status(200).json(expense);
});

/**
 * @desc    Create new expense
 * @route   POST /api/expenses
 * @access  Private (Staff, Admin)
 */
const createExpense = asyncHandler(async (req, res) => {
  const { category, amount, description, date, vendorName, paymentMethod } = req.body;

  // Validate required fields
  if (!category || !amount || !description) {
    res.status(400);
    throw new Error('Please provide category, amount, and description');
  }

  // Get hospital ID from staff user
  let hospitalId;
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ userId: req.user._id });
    if (!staff || !staff.hospital) {
      res.status(400);
      throw new Error('Staff user not associated with a hospital');
    }
    hospitalId = staff.hospital;
  } else if (req.user.role === 'admin' && req.body.hospitalId) {
    hospitalId = req.body.hospitalId;
  } else {
    res.status(400);
    throw new Error('Hospital ID is required');
  }

  // Handle bill image upload with Cloudinary
  let billImageUrl = null;
  if (req.files && req.files.length > 0) {
    billImageUrl = req.files[0].path; // Cloudinary URL is stored in the path property
  }

  // Create expense
  const expense = await Expense.create({
    category,
    amount: Number(amount),
    description,
    date: date || new Date(),
    hospitalId,
    createdBy: req.user._id,
    vendorName,
    billImage: billImageUrl,
    paymentMethod,
    status: 'completed'
  });

  // Populate related fields
  await expense.populate('createdBy', 'name');
  await expense.populate('hospitalId', 'name');

  // Log activity for expense creation
  await ActivityService.logActivity({
    user: req.user._id,
    hospitalId: hospitalId,
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'expense_added',
    subject: 'expense',
    subjectId: expense._id,
    description: `Expense of ${expense.amount} added for ${expense.category}`,
    metadata: {
      amount: expense.amount,
      category: expense.category,
      description: expense.description
    }
  });

  res.status(201).json({ expense });
});

/**
 * @desc    Update expense
 * @route   PUT /api/expenses/:id
 * @access  Private (Staff, Admin)
 */
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }

  // Check authorization
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ userId: req.user._id });
    if (!staff || String(staff.hospital) !== String(expense.hospitalId)) {
      res.status(403);
      throw new Error('Not authorized to update this expense');
    }
  }

  // Handle bill image update with Cloudinary
  let billImageUrl = expense.billImage;
  if (req.files && req.files.length > 0) {
    // Delete old image if it exists
    if (expense.billImage) {
      await deleteFileSafely(expense.billImage);
    }
    
    // Set new image URL from Cloudinary
    billImageUrl = req.files[0].path;
  }

  // Update fields
  const { category, amount, description, date, vendorName, paymentMethod, status } = req.body;

  expense.category = category || expense.category;
  expense.amount = amount ? Number(amount) : expense.amount;
  expense.description = description || expense.description;
  expense.date = date || expense.date;
  expense.vendorName = vendorName !== undefined ? vendorName : expense.vendorName;
  expense.billImage = billImageUrl;
  expense.paymentMethod = paymentMethod || expense.paymentMethod;
  expense.status = status || expense.status;

  const updatedExpense = await expense.save();

  // Populate related fields
  await updatedExpense.populate('createdBy', 'name');
  await updatedExpense.populate('hospitalId', 'name');

  // Log activity for expense update
  await ActivityService.logActivity({
    user: req.user._id,
    hospitalId: expense.hospitalId,
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'expense_updated',
    subject: 'expense',
    subjectId: expense._id,
    description: `Expense updated by ${req.user.name}`,
    metadata: {
      oldAmount: expense.amount,
      newAmount: req.body.amount,
      category: req.body.category,
      description: req.body.description
    }
  });

  res.status(200).json({ expense: updatedExpense });
});

/**
 * @desc    Delete expense
 * @route   DELETE /api/expenses/:id
 * @access  Private (Staff, Admin)
 */
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    res.status(404);
    throw new Error('Expense not found');
  }

  // Check authorization based on user role
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ userId: req.user._id });
    // Staff can only delete expenses from their own hospital
    if (!staff || String(staff.hospital) !== String(expense.hospitalId)) {
      res.status(403);
      throw new Error('Not authorized to delete this expense');
    }
  } else if (req.user.role !== 'admin') {
    // Non-admin users who are not staff also need authorization
    if (expense.createdBy.toString() !== req.user.id) {
      res.status(403);
      throw new Error('Not authorized to delete this expense');
    }
  }

  // Store expense details before deletion for activity log
  const expenseDetails = {
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    hospitalId: expense.hospitalId
  };

  // Delete associated bill image if it exists using Cloudinary delete
  if (expense.billImage) {
    await deleteFileSafely(expense.billImage);
  }

  await Expense.findByIdAndDelete(req.params.id);

  // Log activity for expense deletion
  await ActivityService.logActivity({
    user: req.user._id,
    hospitalId: expenseDetails.hospitalId,
    actorId: req.user._id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action: 'expense_deleted',
    subject: 'expense',
    subjectId: req.params.id,
    description: `Expense deleted by ${req.user.name}`,
    metadata: {
      amount: expenseDetails.amount,
      category: expenseDetails.category,
      description: expenseDetails.description
    }
  });

  res.status(200).json({ 
    success: true, 
    message: 'Expense deleted successfully',
    id: req.params.id 
  });
});

/**
 * @desc    Get expense statistics
 * @route   GET /api/expenses/stats
 * @access  Private (Staff, Admin)
 */
const getExpenseStats = asyncHandler(async (req, res) => {
  // Get hospital ID from staff user
  let hospitalId;
  if (req.user.role === 'staff') {
    const staff = await Staff.findOne({ userId: req.user._id });
    if (staff && staff.hospital) {
      hospitalId = staff.hospital;
    }
  } else if (req.query.hospitalId) {
    hospitalId = req.query.hospitalId;
  }

  if (!hospitalId) {
    res.status(400);
    throw new Error('Hospital ID is required');
  }

  // Get current month start and end dates
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get previous month start and end dates
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Aggregate total expenses by category for current month
  const currentMonthExpenses = await Expense.aggregate([
    {
      $match: {
        hospitalId: new mongoose.Types.ObjectId(hospitalId),
        date: { $gte: currentMonthStart, $lte: currentMonthEnd }
      }
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' }
      }
    }
  ]);

  // Aggregate total expenses by category for previous month
  const prevMonthExpenses = await Expense.aggregate([
    {
      $match: {
        hospitalId: new mongoose.Types.ObjectId(hospitalId),
        date: { $gte: prevMonthStart, $lte: prevMonthEnd }
      }
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' }
      }
    }
  ]);

  // Calculate monthly totals
  const currentMonthTotal = currentMonthExpenses.reduce((sum, item) => sum + item.total, 0);
  const prevMonthTotal = prevMonthExpenses.reduce((sum, item) => sum + item.total, 0);

  // Calculate percentage change
  const percentageChange = prevMonthTotal > 0 
    ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100 
    : 0;

  res.status(200).json({
    currentMonth: {
      expenses: currentMonthExpenses,
      total: currentMonthTotal
    },
    previousMonth: {
      expenses: prevMonthExpenses,
      total: prevMonthTotal
    },
    percentageChange: Math.round(percentageChange * 100) / 100
  });
});

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats
};