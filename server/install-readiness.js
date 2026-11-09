export function installReadiness(s) {
 const state=(ready,label,reason,source)=>({ready,label,reason,source});
 if(s.complete)return state(true,'Complete','Installed or live','outcome');
 if(!s.date)return state(false,'Review needed','Installation date is missing','none');
 if(s.conflictingDate)return state(false,'Review needed','Brian and BAU installation dates differ','conflict');
 if(!s.sourcesHealthy)return state(false,'Review needed','A readiness source is unavailable','unavailable');
 if(s.activeIssues||s.explicitOutstanding)return state(false,'Not ready','Open incident or explicit outstanding preparation','conflict');
 if(/risk|install issues|cancel|hold|reschedule|payment|postpon/i.test(s.siteStatus||''))return state(false,'Not ready',s.siteStatus,'BAU');
 if(s.decision){
  if(s.decisionDate!==s.date)return state(false,'Review needed','VM decision needs reconfirming for this installation date','Brian');
  return state(s.decision==='Ready to install',s.decision==='Ready to install'?'Ready to install':s.decision==='Not ready'?'Not ready':'Review needed','VM decision for '+s.decisionDate,'Brian');
 }
 if(s.gate==='Ready to Proceed'&&(!s.blockReason||/^(ready to proceed|no block)$/i.test(s.blockReason)))return state(true,'Ready to install','Existing BAU Ready to Proceed decision','BAU');
 if(/installation blocked|on hold/i.test(s.gate||''))return state(false,'Not ready',s.blockReason||s.gate,'BAU');
 if(s.responseApproved)return state(true,'Ready to install','Current FZE response reviewed by VM','response');
 return state(false,'Review needed','VM readiness decision required','none');
}
