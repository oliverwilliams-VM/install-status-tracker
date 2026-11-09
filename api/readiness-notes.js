import sources from '../server/tracker-sources.json' with {type:'json'};
import {mondayRead} from '../server/readiness-tracker.js';
export const config={maxDuration:30};
const allowed=new Set(['18432365825',...Object.values(sources.countries).map(c=>c.id)]);
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const board=String(req.query?.board||''),item=String(req.query?.item||'');
 if(!allowed.has(board)||!/^\d+$/.test(item))return res.status(400).json({error:'Invalid notes source'});
 try{
  const proof=await mondayRead('query($ids:[ID!]!){items(ids:$ids){id board{id}}}',{ids:[item]},{token:process.env.MONDAY_API_TOKEN});
  if(String(proof.items?.[0]?.board.id)!==board)return res.status(404).json({error:'Notes source not found'});
  const data=await mondayRead('query($ids:[ID!]!){items(ids:$ids){updates(limit:20){id text_body created_at creator{name} replies{id text_body created_at creator{name}}}}}',{ids:[item]},{token:process.env.MONDAY_API_TOKEN});
  return res.status(200).json({updates:data.items[0].updates,loadedAt:new Date().toISOString()});
 }catch{return res.status(503).json({error:'Monday notes could not be loaded. Open the source item to read the full history.'});}
}
