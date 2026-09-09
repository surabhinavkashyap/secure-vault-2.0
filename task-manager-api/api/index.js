const { createApp } = require('../app')

let handler

module.exports = async (req, res) => {
  try {
    if (!handler) {
      const { app } = await createApp()
      handler = app
    }
    return handler(req, res)
  } catch (err) {
    console.error('Vercel serverless startup error:', err)
    res.status(500).json({
      error: 'Serverless initialization failed',
      details: err.message
    })
  }
}
