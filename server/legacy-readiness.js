const YES=new Set(['yes','ja','jaa']);
const NO=new Set(['no','nee','nein']);
function cleanDate(value){return String(value||'').slice(0,10);}
function sameJob(site,a){return a&&a.scope==='active-installation'&&String(a.store)===site.store&&a.market===site.country&&String(a.boardId)===site.boardId&&String(a.itemId)===site.id&&a.installDate===site.date;}
export function applyLegacyEvidence(site,manualRows,formRows){
 const matches=manualRows.filter(a=>sameJob(site,a)),manual=matches.length===1?matches[0]:null;
 site.manualEvidence=manual;site.legacyReadinessReturned=false;site.reviewFlags=manual?[...(manual.reviewFlags||[])]:[];
 const archived=manual?.originalForms||[];
 const relevant=formRows.filter(f=>f.store===site.store&&(f.markets||[]).includes(site.country));
 const forms=[...new Map([...archived,...relevant].map(f=>[f.boardId+':'+f.id,f])).values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 site.legacyReadinessForms=forms.map(f=>({...f,associatedWithCurrentJob:Boolean(manual&&f.createdAt&&site.createdAt&&f.createdAt>=site.createdAt&&cleanDate(f.createdAt)<=site.date),dateAnomaly:Boolean(f.formDate&&f.createdAt&&Math.abs(Date.parse(f.formDate)-Date.parse(cleanDate(f.createdAt)))>7*86400000)}));
 if(!manual){if(matches.length>1)site.reviewFlags.push('Multiple imported rows match this installation; reconcile the source.');return site;}
 const facts=manual.facts||{};
 site.legacyReadinessReturned=facts.readinessReturned===true;
 if(!site.vm){site.vm=manual.summary||'';site.notesSource='Historical manual sheet';}
 if(facts.tableOrdered==='Yes'&&site.type==='SFK'&&site.tableOrdered==='Unknown')site.tableOrdered='Yes';
 if(facts.hardware==='Yes'&&site.hardware==='Unknown')site.hardware='Yes';
 if(facts.pedOrderDate){site.pedOrderDate=facts.pedOrderDate;if(['unknown','awaiting','signed','submitted'].includes(site.ped.stage)&&!site.ped.conflict){site.ordered='Yes';site.ped={...site.ped,stage:'ordered',label:'Ordered '+facts.pedOrderDate+' — delivery unconfirmed',source:'Historical manual sheet'};}}
 const positive=(source,reason)=>{
  if(site.received==='No'){site.reviewFlags.push('Historical PED delivery conflicts with a current negative receipt answer; confirm with VM.');return;}
  site.received='Yes';site.ped={...site.ped,stage:'delivered',label:reason,source};
 };
 if(facts.pedReceived==='Yes')positive('Historical manual sheet','Delivered — manual confirmation');
 const form=site.legacyReadinessForms.find(f=>f.associatedWithCurrentJob);
 if(form){
  site.legacyReadinessReturned=true;
  if(form.dateAnomaly)site.reviewFlags.push('Original form '+form.id+' has an entered date different from its submission date; confirm context.');
  else{
   const reportDate=cleanDate(form.createdAt),newerOrder=Boolean(facts.pedOrderDate&&facts.pedOrderDate>reportDate);
   if(YES.has(String(form.ped).trim().toLowerCase())){
    if(newerOrder)site.reviewFlags.push('FZE reported PEDs received before the manual order date; reconcile the dates before confirming delivery.');
    else if(!facts.pedReceived)positive('Original FZE readiness response','Delivered — FZE reported '+reportDate);
   }else if(NO.has(String(form.ped).trim().toLowerCase())&&!newerOrder&&site.received!=='Yes'){
    site.ped={...site.ped,stage:'receipt-check',label:'Receipt to confirm — FZE said No '+reportDate,source:'Original FZE readiness response'};
   }
   const pd=String(form.powerData||'').trim().toLowerCase();
   if(YES.has(pd)){if(site.power==='Unknown')site.power='Yes';if(site.data==='Unknown')site.data='Yes';site.powerDataEvidence='Combined power and data confirmed in original FZE response '+reportDate;}
   else if(/will be ready|wird bereit|zal klaar/.test(pd))site.powerDataEvidence='FZE said works would be ready for installation; completion was not confirmed.';
   else if(/vita mojo/.test(pd))site.powerDataEvidence='Original response says VM is to complete power and data; completion was not confirmed.';
   else if(NO.has(pd))site.powerDataEvidence='Original FZE response said power and data were not complete on '+reportDate;
  }
 }
 site.legacyResourceAllocated=facts.resourceAllocated===true;
 site.legacyPowerDataSurveyBooked=facts.powerDataSurveyBooked===true;
 site.reviewFlags=[...new Set(site.reviewFlags)];
 return site;
}
