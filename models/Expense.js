const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['medicine', 'marketing', 'equipment', 'utilities', 'staff', 'other'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    vendorName: {
      type: String
    },
    billImage: {
      type: String
    },
    receiptUrl: {
      type: String
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'credit', 'bank', 'upi', 'other'],
      default: 'cash'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'rejected'],
      default: 'completed'
    }
  },
  {
    timestamps: true
  }
);

// Add index for efficient querying by date and category
expenseSchema.index({ date: 1, category: 1 });
expenseSchema.index({ hospitalId: 1 });

module.exports = mongoose.model('Expense', expenseSchema);