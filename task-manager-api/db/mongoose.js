const mongoose = require('mongoose')

// Cache the connection across serverless invocations (Vercel warm starts)
let cached = global._mongooseCache
if (!cached) cached = global._mongooseCache = { conn: null, promise: null }

async function connectDB(uri) {
  if (cached.conn) return cached.conn
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri)
  }
  cached.conn = await cached.promise
  return cached.conn
}

module.exports = { connectDB }
