const { createApp } = require('../app')

let appPromise = null

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = createApp().then(({ app }) => app)
  }
  const app = await appPromise
  return app(req, res)
}
