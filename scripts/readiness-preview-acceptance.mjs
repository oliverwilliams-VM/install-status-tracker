import assert from 'node:assert/strict';
import handler from '../api/readiness.js';
import {readinessLinkSecret, readinessPortalOrigin} from '../server/readiness-env.js';
import {issueToken} from '../server/token.js';

if(process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='readiness-escalation-review'){
 const env=process.env;
 env.READINESS_BACKEND_ENABLED='YES';
 const origin=readinessPortalOrigin(env);
 const id='rd-acceptance-20261109';
 const token=issueToken({id,revision:1,expires:Date.parse('2026-11-17T23:59:59Z')},readinessLinkSecret(env));
 const request=async body=>{
  let status, response;
  await handler({method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+token},body},{
   setHeader(){},status(n){status=n;return this;},json(data){response=data;return data;},
  });
  assert.equal(status,200,'Readiness '+body.operation+' failed');
  return response.result;
 };
 const opened=await request({operation:'open'});
 assert.equal(opened.binding.id,id);
 assert.equal(opened.binding.store,'999999');
 const answers={
  schemaVersion:2,storeType:'trading',acknowledgementAccepted:true,name:'Fictional acceptance contact',
  team:'yes',area:'yes',powerData:'yes',peds:'yes',floorplan:'yes',comments:'TEST ONLY',
  installDateConfirmed:'yes',goLiveDateKnown:'yes',goLiveDate:'2026-11-17',
  kitDelivered:'yes',kitComplete:'yes',kitUndamaged:'yes',kitSecure:'yes',powerTested:'yes',
  pedQuantityConfirmed:'yes',permits:'yes',accessConfirmed:'yes',networkOnline:'yes',
  networkPrepared:'yes',handoverAvailable:'yes',siteContact:'Fictional test contact',
  contactPhone:'+44 7000 000000',accessHours:'09:00–17:00',accessInstructions:'Test only',
  exceptionDetails:'Fictional evidence pending',exceptionOwner:'Test operator',resolutionDateKnown:'pending',
  evidenceStatus:{powerData:'provided',peds:'pending'},evidenceReasons:{peds:'Synthetic test; no terminal photo'},
 };
 const files=[{category:'powerData',mime:'image/png',name:'fictional-evidence.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}];
 const command={operation:'submit',submissionId:'readiness-acceptance-20261109',answers,files};
 const first=await request(command);
 assert.ok(first.at);
 const retry=await request(command);
 assert.equal(retry.duplicate,true);
 assert.equal(retry.at,first.at);
 const reopened=await request({operation:'open'});
 assert.equal(reopened.submitted,true);
 assert.equal(reopened.history.length,1);
 assert.equal(reopened.history[0].files.length,1);
 assert.equal(reopened.history[0].acknowledgement.version,'readiness-ack-v1');
 console.log('READINESS ACCEPTANCE PASSED: signed open, submit, idempotent retry, one history entry and one attachment.');
}
