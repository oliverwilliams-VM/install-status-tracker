import {verifyToken,hash} from '../server/token.js';
import {rpc} from '../server/coordinator.js';
import {validateAnswers} from '../src/readiness/model.js';
export function validateFiles(files){
 if(!Array.isArray(files)||files.length>4)throw Error('Maximum four photos');
 return files.map(f=>{
  if(!f||!['image/png','image/jpeg'].includes(f.mime)||typeof f.name!=='string'||f.name.length>150||typeof f.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)||f.data.length>970000)throw Error('Invalid photo');
  const b=Buffer.from(f.data,'base64');if(b.length>716800||b.length<8||(f.mime==='image/png'?b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a':b.subarray(0,3).toString('hex')!=='ffd8ff'))throw Error('Invalid photo format');
  if (!['table','powerData','peds','kit'].includes(f.category || 'powerData')) throw Error('Invalid photo category');
  return {category:f.category || 'powerData',name:f.name.replace(/[^a-zA-Z0-9._ -]/g,'_'),mime:f.mime,data:f.data};
 });
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(process.env.READINESS_BACKEND_ENABLED!=='YES')return res.status(503).json({error:'Readiness portal is not activated. Existing forms remain in use.'});
 try{
  const origin=new URL(process.env.READINESS_PORTAL_ORIGIN);if(origin.protocol!=='https:'||req.headers.origin!==origin.origin)throw Error('Invalid origin');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('JSON required');
  const token=String(req.headers.authorization||'').replace(/^Bearer /,''),access=verifyToken(token,process.env.READINESS_LINK_SECRET),b=req.body;
  if(!b||!['open','submit'].includes(b.operation))throw Error('Invalid operation');
  const c={operation:b.operation,id:access.id,revision:access.revision,tokenHash:access.tokenHash};
  if(b.operation==='submit'){
   if(b.answers?.schemaVersion!==2)throw Error('Expanded readiness form and acknowledgement required');
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.submissionId||''))throw Error('Invalid submission ID');
   const opened=await rpc({...c,operation:'open'});c.files=validateFiles(b.files||[]);if(new Set(c.files.map(f=>f.category)).size!==c.files.length)throw Error('One photo per category');c.answers=validateAnswers({...b.answers,evidenceCategories:c.files.map(f=>f.category)},opened.binding.installType,opened.binding);c.submissionId=b.submissionId;c.digest=hash(JSON.stringify({answers:c.answers,files:c.files}));
  }
  return res.status(200).json({result:await rpc(c)});
 }catch{return res.status(400).json({error:'Link or update unavailable. Keep this page open and contact the installation team if retry fails.'});}
}
