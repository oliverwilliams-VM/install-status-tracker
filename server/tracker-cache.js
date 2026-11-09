// Each function instance shares only recent successful reads. Failed reads never
// become a fresh snapshot and concurrent requests share one upstream scan.
export function createTrackerCache(loader,{ttl=45000,now=Date.now}={}) {
 let cached=null,expires=0,pending=null;
 return async function read({fresh=false}={}) {
  if(!fresh&&cached&&now()<expires)return cached;
  if(pending)return pending;
  pending=Promise.resolve().then(loader).then(result=>{
   if(Object.values(result.health||{}).every(h=>h.ok)){cached=result;expires=now()+ttl;}
   return result;
  }).finally(()=>{pending=null;});
  return pending;
 };
}
