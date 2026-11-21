// Faux serveur Supabase Auth, pour les tests uniquement : jetons signés ES256,
// validation de session (/user) et révocation réelle à la déconnexion.
// Comptes : tresorier@iqra.test / correct horse (autorisé), intrus@iqra.test / intrus-pass.
import http from 'node:http'
import crypto from 'node:crypto'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const kid = 'test-kid-1'
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig', key_ops: ['verify'] }
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const USERS = {
  'tresorier@iqra.test': { id: '11111111-1111-4111-8111-111111111111', password: 'correct horse' },
  'intrus@iqra.test': { id: '22222222-2222-4222-8222-222222222222', password: 'intrus-pass' },
}
// loginAgeSeconds : antidate l'heure de connexion des prochaines sessions (test de la durée maximale).
export const state = { nextExpiresIn: 3600, calls: [], loginAgeSeconds: 0 }
const refreshTokens = new Map() // refresh_token -> { email, sessionId, loginAt }
const revokedSessions = new Set()

function sign(user, email, expiresIn, sessionId, loginAt) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'ES256', typ: 'JWT', kid })
  const body = b64({ iss: 'mock', sub: user.id, aud: 'authenticated', exp: now + expiresIn, iat: now, email, role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: loginAt }], session_id: sessionId, is_anonymous: false })
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}
function verify(token) {
  try {
    const [head, body, sig] = token.split('.')
    const ok = crypto.verify('sha256', Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
    if (!ok) return null
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch { return null }
}
const userObject = (id, email) => ({ id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
function session(email, sessionId = crypto.randomUUID(), loginAt = Math.floor(Date.now() / 1000) - state.loginAgeSeconds) {
  const user = USERS[email]
  const expiresIn = state.nextExpiresIn
  state.nextExpiresIn = 3600
  const refresh_token = crypto.randomBytes(8).toString('hex')
  refreshTokens.set(refresh_token, { email, sessionId, loginAt })
  return {
    access_token: sign(user, email, expiresIn, sessionId, loginAt), token_type: 'bearer', expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn, refresh_token, user: userObject(user.id, email),
  }
}
export const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    state.calls.push(`${req.method} ${url.pathname}${url.search}`)
    const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    const bearer = (req.headers.authorization || '').replace(/^Bearer /i, '')
    if (url.pathname === '/__test/login-age') { state.loginAgeSeconds = Number(url.searchParams.get('seconds') ?? 0); return json(200, { loginAgeSeconds: state.loginAgeSeconds }) }
    if (url.pathname === '/auth/v1/.well-known/jwks.json') return json(200, { keys: [jwk] })
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const { email, password } = JSON.parse(raw || '{}')
      const u = USERS[email]
      if (!u || u.password !== password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(200, session(email))
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = JSON.parse(raw || '{}')
      const entry = refreshTokens.get(refresh_token)
      if (!entry || revokedSessions.has(entry.sessionId)) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
      refreshTokens.delete(refresh_token)
      return json(200, session(entry.email, entry.sessionId, entry.loginAt))
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const claims = verify(bearer)
      if (!claims) return json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
      if (revokedSessions.has(claims.session_id)) return json(403, { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' })
      return json(200, userObject(claims.sub, claims.email))
    }
    if (url.pathname === '/auth/v1/logout') {
      const claims = verify(bearer)
      if (claims) revokedSessions.add(claims.session_id)
      res.writeHead(204); return res.end()
    }
    return json(404, { msg: 'not found' })
  })
})

if (process.argv[1] && process.argv[1].endsWith("mock-supabase-auth.mjs")) {
  const port = Number(process.env.MOCK_AUTH_PORT ?? 54399);
  server.listen(port, "127.0.0.1", () => console.log(`faux Supabase Auth sur http://127.0.0.1:${port}`));
}
