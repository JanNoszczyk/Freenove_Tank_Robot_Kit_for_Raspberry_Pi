import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'

test.describe('Robot Control UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
    // Wait for app to load
    await page.waitForLoadState('networkidle')
  })

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Tank Robot Control/)
  })

  test('connection panel renders', async ({ page }) => {
    // Check for connection panel - look for Connection text
    await expect(page.getByText('Connection')).toBeVisible()
  })

  test('mode selector renders with Manual and AI modes', async ({ page }) => {
    // Check for mode toggle buttons
    await expect(page.getByRole('button', { name: /manual/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /ai/i })).toBeVisible()
  })

  test('header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /tank robot control/i })).toBeVisible()
  })

  test('movement controls are visible in manual mode', async ({ page }) => {
    // Movement card should show in default (manual) mode
    await expect(page.getByText('Movement')).toBeVisible()
  })

  test('no critical console errors on page load', async ({ page }) => {
    const criticalErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore expected errors
        if (!text.includes('WebSocket') &&
            !text.includes('Failed to fetch') &&
            !text.includes('500') &&
            !text.includes('connect')) {
          criticalErrors.push(text)
        }
      }
    })

    await page.goto(BASE_URL)
    await page.waitForTimeout(2000)

    expect(criticalErrors).toHaveLength(0)
  })
})

// API Integration Tests
test.describe('Backend API', () => {
  const API_BASE = 'http://localhost:8000/api'

  test('GET /api/status returns connection status', async ({ request }) => {
    const response = await request.get(`${API_BASE}/status`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('connected')
    expect(data).toHaveProperty('ip')
    expect(data).toHaveProperty('sensors')
    expect(data.sensors).toHaveProperty('ultrasonic')
    expect(data.sensors).toHaveProperty('gripper')
  })

  test('POST /api/disconnect works', async ({ request }) => {
    const response = await request.post(`${API_BASE}/disconnect`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.connected).toBe(false)
  })

  test('POST /api/motor returns 400 when not connected', async ({ request }) => {
    // First disconnect
    await request.post(`${API_BASE}/disconnect`)

    const response = await request.post(`${API_BASE}/motor`, {
      data: { left: 1000, right: 1000 },
    })
    expect(response.status()).toBe(400)

    const data = await response.json()
    expect(data.detail).toBe('Not connected to robot')
  })

  test('POST /api/motor with missing fields returns 422', async ({ request }) => {
    const response = await request.post(`${API_BASE}/motor`, {
      data: {},
    })
    expect(response.status()).toBe(422)
  })

  test('POST /api/motor with invalid types returns 422', async ({ request }) => {
    const response = await request.post(`${API_BASE}/motor`, {
      data: { left: 'fast', right: 'slow' },
    })
    expect(response.status()).toBe(422)
  })
})
