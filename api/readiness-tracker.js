import {loadTracker} from '../server/readiness-tracker.js';

export const config = {maxDuration:60};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  try {
    const result = await loadTracker({token:process.env.MONDAY_API_TOKEN});
    return res.status(200).json(result);
  } catch {
    return res.status(503).json({error:'Monday data could not be loaded. Refresh or verify the source boards.'});
  }
}
