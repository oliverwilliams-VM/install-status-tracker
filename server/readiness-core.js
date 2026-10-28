import {copyFor} from '../src/readiness/copy.js';
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
 if (c.operation === 'rebindContext') {
  if (!c.sourceVerified || r.pendingMail || r.pendingSubmission) throw Error('Verified context and reconciled operations required');
  validateBinding(c.binding);
  for (const k of ['id','store','country','boardId','itemId']) if(c.binding[k]!==r.binding[k])throw Error('Cannot rebind to a different installation');
  if(c.binding.projectType===r.binding.projectType&&c.binding.installType===r.binding.installType&&c.binding.installDate===r.binding.installDate&&!r.projectTypeIssue)return {record:r,result:{revision:r.revision}};
  if(!/^[a-f0-9]{64}$/.test(c.tokenHash||'')||!(c.expires>now))throw Error('Replacement token required');
  r.history.push({type:'context-rebound',at,previousBinding:r.binding,previousRevision:r.revision,previousAnswers:r.answers,previousIssue:r.projectTypeIssue||null});
  r.binding=c.binding;r.sourceReference=c.sourceReference;r.revision+=1;r.tokenHash=c.tokenHash;r.expires=c.expires;r.answers=null;r.submitted=false;r.sent={};r.submissions={};r.vmReview=null;r.projectTypeIssue=null;
  return {record:r,result:{revision:r.revision}};
 }
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
 if (['open','beginSubmission','commitSubmission','reportProjectMismatch'].includes(c.operation) && (r.cancelled || r.revision!==c.revision || c.tokenHash!==r.tokenHash || !(r.expires>now))) throw Error('Expired or replaced link');
 if (c.operation==='open') return {record:r,result:{binding:r.binding,revision:r.revision,submitted:r.submitted,answers:r.answers,projectTypeIssue:r.projectTypeIssue || null,vmReviewStatus:r.vmReview?.decision || 'pending',history:r.history.filter(h=>h.type==='submission').map(h=>({id:h.id,at:h.at,answers:h.answers,acknowledgement:h.acknowledgement,files:h.files.map(f=>({name:f.name}))}))}};
 if (c.operation==='reportProjectMismatch') {
  if(typeof c.reason!=='string'||c.reason.trim().length<5||c.reason.length>1000)throw Error('Project discrepancy explanation required');
  if(r.projectTypeIssue)return {record:r,result:{flagged:true,duplicate:true}};
  r.projectTypeIssue={reason:c.reason.trim(),at,revision:r.revision};r.vmReview=null;r.history.push({type:'project-type-issue',...r.projectTypeIssue});return {record:r,result:{flagged:true}};
 }
 if (c.operation==='beginSubmission') {
  if(r.projectTypeIssue)throw Error('Project type must be reviewed before readiness submission');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(c.submissionId || '')) throw Error('Invalid submission ID');
  const old=r.submissions[c.submissionId];
  if (old) {if(old.digest!==c.digest)throw Error('Submission ID reused');return {record:r,result:{completed:true,...old}};}
  if(r.pendingMail)throw Error('Message in flight; reconcile');
  const answers=validateAnswers(c.answers,r.binding.installType,r.binding);
  if(r.pendingSubmission){if(r.pendingSubmission.id!==c.submissionId||r.pendingSubmission.digest!==c.digest)throw Error('Submission outcome uncertain; reconcile');return {record:r,result:{pending:true,phase:r.pendingSubmission.phase}};}
  r.pendingSubmission={id:c.submissionId,digest:c.digest,answers,at,phase:'reserved',acknowledgement:answers.schemaVersion===2?{version:answers.acknowledgementVersion,text:copyFor(r.binding.country).acknowledgement,country:r.binding.country,installType:r.binding.installType,at}:null};return {record:r,result:{reserved:true}};
 }
 if(c.operation==='commitSubmission'){
  const p=r.pendingSubmission;
  if(!p||p.id!==c.submissionId||p.digest!==c.digest||!c.archiveId||!c.mondayItemId)throw Error('Submission receipt mismatch');
  const receipt={at:p.at,digest:p.digest,archiveId:c.archiveId,mondayItemId:c.mondayItemId};
  r.answers=p.answers;r.submitted=true;r.vmReview=null;r.submissions[p.id]=receipt;r.history.push({id:p.id,type:'submission',at:p.at,answers:p.answers,acknowledgement:p.acknowledgement,files:c.files||[],archiveId:c.archiveId,mondayItemId:c.mondayItemId});r.pendingSubmission=null;
  return {record:r,result:{at:receipt.at,blockers:blockers(r.answers,r.binding.installType,r.binding)}};
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
 if(c.operation==='review'){
  if(!['pending','hold','approved'].includes(c.decision)||!c.reviewer?.trim())throw Error('Reviewer and decision required');
  if(c.decision==='approved'&&(r.projectTypeIssue||!r.submitted||r.answers?.schemaVersion!==2||blockers(r.answers,r.binding.installType,r.binding).length))throw Error('Cannot approve incomplete readiness');
  r.vmReview={decision:c.decision,reviewer:c.reviewer.trim(),at,revision:r.revision,submissionCount:r.history.filter(h=>h.answers).length};r.history.push({type:'vm-review',...r.vmReview});return {record:r,result:r.vmReview};
 }
 if(c.operation==='note'){
  if(!['internal','shared'].includes(c.visibility)||!c.author?.trim()||!c.text?.trim()||c.text.length>3000)throw Error('Invalid note');
  r.notes.push({at,author:c.author.trim(),text:c.text.trim(),visibility:c.visibility});return {record:r,result:{saved:true}};
 }
 throw Error('Unsupported operation');
}
