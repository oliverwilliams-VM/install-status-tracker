import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
export const hash=v=>createHash('sha256').update(v).digest('hex');
export const mac=(secret,v)=>createHmac('sha256',secret).update(v).digest('hex');
export function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function issueToken({id,revision,expires},secret){if(!secret||secret.length<32||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(expires))throw Error('Invalid token configuration');const p=Buffer.from(JSON.stringify({id,revision,expires})).toString('base64url');return p+'.'+mac(secret,p);}
export function verifyToken(token,secret,now=Date.now()){
 if(!secret||secret.length<32||typeof token!=='string'||token.length>1000)throw Error('Invalid access link');
 const parts=token.split('.');if(parts.length!==2||!equal(mac(secret,parts[0]),parts[1]))throw Error('Invalid access link');
 const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());if(!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||!Number.isSafeInteger(p.revision)||p.revision<1||!Number.isSafeInteger(p.expires)||p.expires<=now)throw Error('Expired access link');
 return {...p,tokenHash:hash(token)};
}
