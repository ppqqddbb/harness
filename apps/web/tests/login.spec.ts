// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkAuth, renderLoginPage } from '../src/login.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.replaceChildren()
  document.head.querySelector('#dsh-login-style')?.remove()
})

function mount(onSuccess = vi.fn()) {
  document.body.innerHTML = '<div id="root"></div>'
  renderLoginPage(onSuccess)
  return {
    onSuccess,
    form: document.getElementById('loginForm') as HTMLFormElement,
    username: document.getElementById('username') as HTMLInputElement,
    password: document.getElementById('password') as HTMLInputElement,
    remember: document.getElementById('remember') as HTMLInputElement,
    submit: document.getElementById('submitBtn') as HTMLButtonElement,
  }
}

function authenticate() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('login page', () => {
  it('renders the designed form and toggles password visibility', () => {
    const { username, password } = mount()
    expect(document.title).toBe('DSH 本地控制台 · 登录')
    expect(document.querySelector('.logo')).not.toBeNull()
    expect(document.querySelector('.card-foot')?.textContent).toContain(location.host)
    expect(document.activeElement).toBe(username)
    const eye = document.getElementById('eyeBtn') as HTMLButtonElement
    eye.click()
    expect(password.type).toBe('text')
    expect(eye.getAttribute('aria-label')).toBe('隐藏密码')
  })

  it('validates required fields before sending a request', () => {
    const fetchMock = authenticate()
    const { form } = mount()
    form.requestSubmit()
    expect(document.getElementById('field-user')?.classList.contains('invalid')).toBe(true)
    expect(document.getElementById('field-pwd')?.classList.contains('invalid')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits real credentials, remembers the username, and completes login', async () => {
    const fetchMock = authenticate()
    const { form, username, password, remember, onSuccess } = mount()
    username.value = 'admin'
    password.value = 'secret'
    remember.checked = true
    form.requestSubmit()
    await vi.waitFor(() => { expect(onSuccess).toHaveBeenCalled() }, { timeout: 1_500 })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: 'admin', password: 'secret', remember: true }),
    })
    expect(localStorage.getItem('dsh.login.username')).toBe('admin')
  })

  it('restores a remembered username', () => {
    localStorage.setItem('dsh.login.username', 'admin')
    const { username, remember } = mount()
    expect(username.value).toBe('admin')
    expect(remember.checked).toBe(true)
  })

  it('reports rejected credentials without leaving the form busy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Invalid credentials' }),
    })))
    const { form, username, password, submit } = mount()
    username.value = 'admin'
    password.value = 'wrong'
    form.requestSubmit()
    await vi.waitFor(() => { expect(document.getElementById('formError')?.textContent).toBe('用户名或密码错误') })
    expect(submit.disabled).toBe(false)
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { form, username, password } = mount()
    username.value = 'admin'
    password.value = 'secret'
    form.requestSubmit()
    await vi.waitFor(() => { expect(document.getElementById('formError')?.textContent).toBe('网络错误，请稍后重试') })
  })
})

describe('auth status', () => {
  it('returns the server verdict and treats a failed probe as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true }) })))
    await expect(checkAuth()).resolves.toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(checkAuth()).resolves.toBe(false)
  })
})
