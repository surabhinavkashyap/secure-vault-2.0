import axios from 'axios'

// Same-origin requests work in both modes: Vite proxies /api in development and
// Express serves the production bundle. VITE_API_URL remains available for a
// separately hosted API.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: { Accept: 'application/json' },
})

export async function apiRequest(path, options = {}) {
  const { token, body, headers, method = 'GET', ...requestOptions } = options
  try {
    const response = await client.request({
      url: path,
      method,
      data: body,
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...requestOptions,
    })
    return response.data
  } catch (error) {
    if (!error.response) {
      throw new Error('SecureVault is starting its secure service. Please retry in a moment.', { cause: error })
    }
    const message = error.response.data?.message
      || error.response.data?.error
      || (error.response.status === 401
        ? 'Your session has expired. Please unlock your vault again.'
        : 'Something went wrong. Please try again.')
    const requestError = new Error(message, { cause: error })
    requestError.status = error.response.status
    throw requestError
  }
}

export async function checkApiHealth() {
  try {
    const response = await apiRequest('/api/health', { timeout: 3500 })
    return response?.status === 'ok'
  } catch {
    return false
  }
}
