const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const hash = value => createHash('sha256').update(value).digest('hex');
const schema = new mongoose.Schema({ _id: String, kind: String, data: mongoose.Schema.Types.Mixed, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session = mongoose.model('Session', schema);
function createAuthStore({memory = false, now = () => Date.now()} = {}) {
  const records = new Map();
  return {
    async put(kind, data, lifetime) {
      const token = randomBytes(32).toString('base64url');
      const row = {_id:hash(token),kind,data,expiresAt:new Date(now()+lifetime)};
      if (memory) records.set(row._id,row); else await Session.create(row);
      return token;
    },
    async get(token, kind, consume = false) {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
      const id = hash(token);
      let row;
      if (memory) { row = records.get(id); if (consume) records.delete(id); }
      else row = await (consume ? Session.findOneAndDelete({_id:id,kind}) : Session.findOne({_id:id,kind})).lean();
      return row?.kind === kind && +row.expiresAt > now() ? row.data : null;
    },
    async remove(token) { if (!token) return; if (memory) records.delete(hash(token)); else await Session.deleteOne({_id:hash(token)}); },
  };
}
function googleProvider({clientId,clientSecret,baseUrl}) {
  const client = new OAuth2Client(clientId,clientSecret,`${baseUrl}/api/auth/google/callback`);
  return {
    async start(state) {
      const {codeVerifier,codeChallenge} = await client.generateCodeVerifierAsync();
      const nonce = randomBytes(24).toString('base64url');
      return { verifier:codeVerifier, nonce, url:client.generateAuthUrl({scope:['openid','email','profile'],state,nonce,code_challenge:codeChallenge,code_challenge_method:'S256',prompt:'select_account'}) };
    },
    async finish(code, pending) {
      const {tokens} = await client.getToken({code,codeVerifier:pending.verifier});
      const ticket = await client.verifyIdToken({idToken:tokens.id_token,audience:clientId});
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email_verified || payload.nonce !== pending.nonce) throw new Error('Invalid Google identity');
      return {id:payload.sub,email:payload.email,name:payload.name || payload.email};
    },
  };
}
function cookie(req,name) { return (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1); }
module.exports = {createAuthStore,googleProvider,cookie};
