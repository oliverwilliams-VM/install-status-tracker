// Authenticated RPC pattern reused from brian-direct-sign; separate namespace/project.
import {randomBytes} from 'node:crypto';
import {mac,equal} from './token.js';
export async function rpc(command,{env=process.env,fetchImpl=fetch,now=Date.now}={}){
 if(env.READINESS_BACKEND_ENABLED!=='YES'||!env.READINESS_RPC_SECRET||env.READINESS_RPC_SECRET.length<32)throw Error('Readiness backend not activated');
 const u=new URL(env.READINESS_COORDINATOR_URL);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('Invalid coordinator URL');
 const nonce=randomBytes(32).toString('hex'),timestamp=now(),payload=JSON.stringify(command);if(payload.length>4100000)throw Error('Request too large');
 const body=JSON.stringify({nonce,timestamp,payload,mac:mac(env.READINESS_RPC_SECRET,timestamp+'\n'+nonce+'\n'+payload)});
 let r=await fetchImpl(u.href,{method:'POST',headers:{'Content-Type':'application/json'},body,redirect:'manual',signal:AbortSignal.timeout(30000)});
 if([301,302,303,307,308].includes(r.status)){const next=new URL(r.headers.get('location'));if(next.protocol!=='https:'||next.hostname!=='script.googleusercontent.com'||next.username||next.password)throw Error('Invalid redirect');r=await fetchImpl(next.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)});}
 if(!r.ok)throw Error('Coordinator unavailable');const signed=await r.json();
 if(signed.nonce!==nonce||typeof signed.payload!=='string'||signed.payload.length>120000||!equal(mac(env.READINESS_RPC_SECRET,nonce+'\n'+signed.payload),signed.mac))throw Error('Unverified response');
 const out=JSON.parse(signed.payload);if(!out.ok)throw Error(out.error||'Update rejected');return out.result;
}
