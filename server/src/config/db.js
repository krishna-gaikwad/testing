const mongoose = require('mongoose');

/**
 * Connect to MongoDB with fallback graceful handling for development/demo mode
 */
const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nagar_setu';
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000, // Quick timeout if local mongo is not running
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.warn('⚠️ MongoDB connection failed:', error.message);
    console.log('ℹ️ Running in demo memory-store mode: Server continues without crashing');
  }
};

module.exports = connectDB;
