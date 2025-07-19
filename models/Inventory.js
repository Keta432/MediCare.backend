const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'out-of-stock'],
    default: 'in-stock'
  },
  category: {
    type: String,
    required: true
  },
  minimumQuantity: {
    type: Number,
    required: true,
    default: 10
  },
  location: {
    type: String,
    required: true
  },
  supplier: {
    name: String,
    contact: String,
    email: String
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Middleware to update status based on quantity
inventorySchema.pre('save', function(next) {
  if (this.quantity <= 0) {
    this.status = 'out-of-stock';
  } else if (this.quantity <= this.minimumQuantity) {
    this.status = 'low-stock';
  } else {
    this.status = 'in-stock';
  }
  next();
});

// Index for faster queries
inventorySchema.index({ status: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ name: 'text' });

module.exports = mongoose.model('Inventory', inventorySchema);