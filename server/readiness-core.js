import { validateBinding, validateAnswers, blockers, planReminder, reschedule, dateOnly } from '../src/readiness/model.js';
export function reduce(previous, c, now) {
 const at = new Date(now).toISOString();
 if (c.operation === 'issue') {
  validateBinding(c.binding);
  if (previous) throw Error('Request exists; reconcile or reschedule');
  for (const k of ['fzeEmail','mfpEmail']) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c[k] || '')) throw Error('Verified recipients required');
  if (!c.sourceVerified || !/^[a-f0-9]{64}$/.test(c.tokenHash || '') || !(c.expires > now)) throw Error('Verified source and credentials required');
  const record = {binding:c.binding,revision:1,tokenHash:c.tokenHash,expires:c.expires,fzeEmail:c.fzeEmail,mfpEmail:c.mfpEmail,sourceReference:c.sourceReference,submitted:false,answers:null,sent:{},history:[],notes:[],pendingMail:null,pendingSubmission:null,submissions:{},createdAt:at};
  return {record,result:{id:record.binding.id,revision:1}};
 }
 if (!previous) throw Error('Request not found');
 const r = JSON.parse(JSON.stringify(previous));
 if (c.operation === 'reschedule') {
  if (!c.sourceVerified || r.pendingMail || r.pendingSubmission) throw Error('Verified reschedule and reconciled operations required');
  const next = reschedule(r,c.installDate);
  if (next.revision === r.revision) return {record:r,result:{revision:r.revision}};
  if (!/^[a-f0-9]{64}$/.test(c.tokenHash || '') || !(c.expires > now)) throw Error('Replacement token required');
  next.tokenHash=c.tokenHash;next.expires=c.expires;next.submissions={};
  return {record:next,result:{revision:next.revision}};
 }
 if (c.operation === 'cancel') {
  if (r.pendingMail || r.pendingSubmission) throw Error('Reconcile pending work');
  r.cancelled=true;r.history.push({type:'cancelled',at});return {record:r,result:{cancelled:true}};
 }
 if (['open','beginSubmission','commitSubmission'].includes(c.operation) && (r.cancelled || r.revision!==c.revision || c.tokenHash!==r.tokenHash || !(r.expires>now))) throw Error('Expired or replaced link');
 if (c.operation==='open') return {record:r,result:{binding:r.binding,revision:r.revision,submitted:r.submitted,answers:r.answers,history:r.history.filter(h=>h.type==='submission').map(h=>({id:h.id,at:h.at,answers:h.answers,files:h.files.map(f=>({name:f.name}))}))}};
 if (c.operation==='beginSubmission') {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(c.submissionId || '')) throw Error('Invalid submission ID');
  const old=r.submissions[c.submissionId];
  if (old) {if(old.digest!==c.digest)throw Error('Submission ID reused');return {record:r,result:{completed:true,...old}};}
  if(r.pendingMail)throw Error('Message in flight; reconcile');
  const answers=validateAnswers(c.answers,r.binding.installType);
  if(r.pendingSubmission){if(r.pendingSubmission.id!==c.submissionId||r.pendingSubmission.digest!==c.digest)throw Error('Submission outcome uncertain; reconcile');return {record:r,result:{pending:true,phase:r.pendingSubmission.phase}};}
  r.pendingSubmission={id:c.submissionId,digest:c.digest,answers,at,phase:'reserved'};return {record:r,result:{reserved:true}};
 }
 if(c.operation==='commitSubmission'){
  const p=r.pendingSubmission;
  if(!p||p.id!==c.submissionId||p.digest!==c.digest||!c.archiveId||!c.mondayItemId)throw Error('Submission receipt mismatch');
  const receipt={at:p.at,digest:p.digest,archiveId:c.archiveId,mondayItemId:c.mondayItemId};
  r.answers=p.answers;r.submitted=true;r.submissions[p.id]=receipt;r.history.push({id:p.id,type:'submission',at:p.at,answers:p.answers,files:c.files||[],archiveId:c.archiveId,mondayItemId:c.mondayItemId});r.pendingSubmission=null;
  return {record:r,result:{at:receipt.at,blockers:blockers(r.answers,r.binding.installType)}};
 }
 if(c.operation==='plan')return {record:r,result:r.pendingMail||r.pendingSubmission?{state:'blocked',reason:'Pending operation requires reconciliation'}:planReminder(r,c.today)};
 if(c.operation==='reserveMail'){
  if(r.pendingMail||r.pendingSubmission)throw Error('Reconcile pending operation');
  const p=planReminder(r,c.today);if(p.state!=='due'||p.key!==c.key)throw Error('Message not due');r.pendingMail={...p,reservedAt:at};return {record:r,result:r.pendingMail};
 }
 if(c.operation==='confirmSent'){
  if(!r.pendingMail||r.pendingMail.key!==c.key||!c.sentMessageId||c.receiptVerified!==true)throw Error('Verified Sent receipt required');
  r.sent[r.pendingMail.stage]={date:dateOnly(c.today),messageId:c.sentMessageId};r.history.push({type:'sent',at,key:c.key,to:r.pendingMail.to,cc:r.pendingMail.cc,messageId:c.sentMessageId});r.pendingMail=null;return {record:r,result:{confirmed:true}};
 }
 if(c.operation==='note'){
  if(!['internal','shared'].includes(c.visibility)||!c.author?.trim()||!c.text?.trim()||c.text.length>3000)throw Error('Invalid note');
  r.notes.push({at,author:c.author.trim(),text:c.text.trim(),visibility:c.visibility});return {record:r,result:{saved:true}};
 }
 throw Error('Unsupported operation');
}
