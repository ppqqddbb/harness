/** Local Web authentication gate and the standalone login page. */
import loginMarkup from './login.html?raw'
import loginStyles from './login.css?inline'

interface AuthStatusResponse {
  authenticated?: boolean
}

interface LoginResponse {
  success?: boolean
  error?: string
}

const REMEMBERED_USERNAME_KEY = 'dsh.login.username'

function required<T extends Element>(selector: string, type: new () => T): T {
  const node = document.querySelector<T>(selector)
  if (!(node instanceof type)) throw new Error(`login page: missing ${selector}`)
  return node
}

/**
 * Check whether the Web server has an authenticated session for this browser.
 * @returns true when `/api/auth/me` reports an authenticated local user.
 */
export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    const data = await res.json() as AuthStatusResponse
    return data.authenticated === true
  } catch {
    return false
  }
}

/**
 * Render the local login page and submit credentials to the local auth API.
 * @param onSuccess - called after the server accepts the credentials.
 */
export function renderLoginPage(onSuccess: () => void): void {
  const root = document.getElementById('root')
  if (root === null) throw new Error('login page: missing #root')

  const style = document.createElement('style')
  style.id = 'dsh-login-style'
  style.textContent = loginStyles
  document.head.append(style)
  root.innerHTML = loginMarkup
  document.title = 'DSH 本地控制台 · 登录'

  const form = required('#loginForm', HTMLFormElement)
  const card = required('#card', HTMLElement)
  const username = required('#username', HTMLInputElement)
  const password = required('#password', HTMLInputElement)
  const userField = required('#field-user', HTMLElement)
  const passwordField = required('#field-pwd', HTMLElement)
  const eye = required('#eyeBtn', HTMLButtonElement)
  const capsHint = required('#capsHint', HTMLElement)
  const submit = required('#submitBtn', HTMLButtonElement)
  const submitText = submit.querySelector<HTMLElement>('.btn-text')
  const formError = required('#formError', HTMLElement)
  const remember = required('#remember', HTMLInputElement)
  const host = required('#loginHost', HTMLElement)
  if (submitText === null) throw new Error('login page: missing submit label')

  host.textContent = window.location.host
  try {
    const remembered = localStorage.getItem(REMEMBERED_USERNAME_KEY)
    if (remembered !== null) {
      username.value = remembered
      remember.checked = true
    }
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }

  eye.addEventListener('click', () => {
    const show = password.type === 'password'
    password.type = show ? 'text' : 'password'
    eye.classList.toggle('on', show)
    eye.setAttribute('aria-label', show ? '隐藏密码' : '显示密码')
    password.focus()
  })

  const updateCapsHint = (event: KeyboardEvent): void => {
    capsHint.classList.toggle('show', event.getModifierState('CapsLock'))
  }
  password.addEventListener('keydown', updateCapsHint)
  password.addEventListener('keyup', updateCapsHint)
  password.addEventListener('blur', () => { capsHint.classList.remove('show') })

  username.addEventListener('input', () => { userField.classList.remove('invalid') })
  password.addEventListener('input', () => { passwordField.classList.remove('invalid') })
  form.addEventListener('input', () => { formError.classList.remove('show') })

  card.addEventListener('animationend', (event) => {
    if (event.animationName === 'shake') card.classList.remove('shake')
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    let valid = true
    if (username.value.trim() === '') { userField.classList.add('invalid'); valid = false }
    if (password.value === '') { passwordField.classList.add('invalid'); valid = false }
    if (!valid) {
      card.classList.remove('shake')
      void card.offsetWidth
      card.classList.add('shake')
      ;(userField.classList.contains('invalid') ? username : password).focus()
      return
    }

    submit.disabled = true
    submit.classList.remove('success')
    submit.classList.add('loading')
    submitText.textContent = '登录中…'
    formError.classList.remove('show')

    void (async () => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username: username.value.trim(),
            password: password.value,
            remember: remember.checked,
          }),
        })
        const data = await res.json().catch(() => undefined) as LoginResponse | undefined
        if (!res.ok || data?.success !== true) {
          if (res.status === 401 && data !== undefined) {
            userField.classList.add('invalid')
            passwordField.classList.add('invalid')
            formError.textContent = '用户名或密码错误'
          } else if (res.status === 401) {
            formError.textContent = '登录接口未启用，请重启服务后重试'
          } else {
            formError.textContent = '登录失败，请稍后重试'
          }
          formError.classList.add('show')
          submit.disabled = false
          submit.classList.remove('loading')
          submitText.textContent = '登录'
          return
        }

        try {
          if (remember.checked) localStorage.setItem(REMEMBERED_USERNAME_KEY, username.value.trim())
          else localStorage.removeItem(REMEMBERED_USERNAME_KEY)
        } catch {
          // Session persistence still follows the server cookie when storage is unavailable.
        }

        submit.classList.remove('loading')
        submit.classList.add('success')
        submitText.textContent = '✓ 登录成功'
        window.setTimeout(onSuccess, 700)
      } catch {
        formError.textContent = '网络错误，请稍后重试'
        formError.classList.add('show')
        submit.disabled = false
        submit.classList.remove('loading')
        submitText.textContent = '登录'
      }
    })()
  })

  username.focus()
}
