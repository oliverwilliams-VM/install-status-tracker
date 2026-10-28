/** Readiness-only standalone coordinator. DO NOT paste over the existing PED doPost.
 * Add generated ReadinessCore.gs beside this file. No triggers installed here.
 * Private Drive stores durable state; ScriptLock serializes all request transitions.
 * RD_ENABLED=YES enables RPC. RD_WRITES_APPROVED=YES separately permits submission filing.
 */
function doPost(e) {
 var p=PropertiesService.getScriptProperties(),secret=p.getProperty('RD_RPC_SECRET')||'',nonce='',lock=LockService.getScriptLock(),held=false,out;
 try {
  if(p.getProperty('RD_ENABLED')!=='YES'||secret.length<32)throw Error('Readiness coordinator disabled');
  var w=JSON.parse(e.postData.contents);nonce=w.nonce;
  if(!/^[a-f0-9]{64}$/.test(nonce||'')||!Number.isSafeInteger(w.timestamp)||Math.abs(Date.now()-w.timestamp)>60000||typeof w.payload!=='string'||w.payload.length>4100000||!RD_equal_(RD_mac_(secret,w.timestamp+'\n'+nonce+'\n'+w.payload),w.mac))throw Error('Invalid RPC');
  if(!lock.tryLock(15000))throw Error('Coordinator busy');held=true;
  var all=p.getProperties(),nonceKey='RD_NONCE_'+nonce;
  Object.keys(all).forEach(function(k){if(k.indexOf('RD_NONCE_')===0&&Number(all[k])<Date.now())p.deleteProperty(k);});
  if(p.getProperty(nonceKey))throw Error('Replayed RPC');p.setProperty(nonceKey,String(Date.now()+120000));
  var c=JSON.parse(w.payload);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id||''))throw Error('Invalid installation ID');
  var folder=DriveApp.getFolderById(p.getProperty('RD_STATE_FOLDER_ID')),file=RD_find_(folder,c.id+'.json'),record=file?JSON.parse(file.getBlob().getDataAsString()):null;
  var save=function(r){var encoded=JSON.stringify(r);if(encoded.length>1500000)throw Error('Archive capacity requires review');if(file)file.setContent(encoded);else file=folder.createFile(c.id+'.json',encoded,'application/json');if(file.getBlob().getDataAsString()!==encoded)throw Error('State write unconfirmed');};
  if(c.operation==='submit')out={ok:true,result:RD_submit_(record,c,save,p)};
  else {
   if(['issue','reschedule','rebindContext','cancel','reserveMail','confirmSent','note','review'].indexOf(c.operation)>=0&&p.getProperty('RD_OPERATOR_ENABLED')!=='YES')throw Error('Operator transitions disabled');
   if(c.operation==='issue'||c.operation==='reschedule'||c.operation==='rebindContext'){if(c.binding&&c.binding.id!==c.id)throw Error('Request binding mismatch');RD_verifySource_(c,p,record);}
   if(c.operation==='open')RD_assertCurrent_(record,p);
   var result=reduce(record,c,Date.now());if(c.operation!=='open'&&c.operation!=='plan')save(result.record);
   if(c.operation==='reportProjectMismatch'&&!result.result.duplicate){
    result.record.projectTypeIssue.mondayStatus='pending';save(result.record);
    var body='READINESS PROJECT TYPE CHECK — '+result.record.binding.store+'\n'+c.reason.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var receipt=RD_monday_('mutation($i:ID!,$body:String!){create_update(item_id:$i,body:$body){id}}',{i:result.record.binding.itemId,body:body},p);
    result.record.projectTypeIssue.mondayStatus='recorded';result.record.projectTypeIssue.updateId=receipt.create_update.id;save(result.record);
   }
   out={ok:true,result:result.result};
  }
 } catch(err){out={ok:false,error:String(err.message||'Readiness coordinator failed')};}
 finally{if(held)lock.releaseLock();}
 var payload=JSON.stringify(out);return ContentService.createTextOutput(JSON.stringify({nonce:nonce,payload:payload,mac:secret?RD_mac_(secret,nonce+'\n'+payload):''})).setMimeType(ContentService.MimeType.JSON);
}
function RD_find_(folder,name){var all=folder.getFilesByName(name),first=all.hasNext()?all.next():null;if(all.hasNext())throw Error('Duplicate state files; reconcile');return first;}
function RD_hash_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function RD_mac_(secret,text){return Utilities.computeHmacSha256Signature(text,secret,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function RD_equal_(a,b){if(typeof b!=='string'||a.length!==b.length)return false;var n=0;for(var i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function RD_monday_(query,variables,p){
 var token=p.getProperty('RD_MONDAY_TOKEN');if(!token)throw Error('Monday not configured');
 var response=UrlFetchApp.fetch('https://api.monday.com/v2',{method:'post',contentType:'application/json',headers:{Authorization:token,'API-Version':'2026-04'},payload:JSON.stringify({query:query,variables:variables}),muteHttpExceptions:true});
 var result=JSON.parse(response.getContentText());if(response.getResponseCode()!==200||result.errors||!result.data)throw Error('Monday operation unconfirmed');return result.data;
}
function RD_verifySource_(c,p,previous){
 // This mapping must be reviewed against CURRENT Brain columns, never guessed.
 var m=JSON.parse(p.getProperty('RD_SOURCE_MAP')||'null');if(!m||!m.brainBoardId||!m.installLinkColumn||!m.countryColumn||!m.fzeEmailColumn||!m.mfpEmailColumn||!m.installDateColumn)throw Error('Verified Brain source mapping required');
 if(!/^\d+$/.test(String(c.brainItemId||'')))throw Error('Bound Brain item required');
 var data=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id name board{id} column_values{id text value ... on BoardRelationValue{linked_item_ids}}}}',{ids:[String(c.brainItemId)]},p),item=data.items[0];
 if(!item||String(item.board.id)!==String(m.brainBoardId))throw Error('Brain identity mismatch');
 var values={};item.column_values.forEach(function(v){values[v.id]=v;});
 var binding=c.binding;if(c.operation==='reschedule')binding=Object.assign({},previous.binding,{installDate:c.installDate});
 var links=values[m.installLinkColumn];if(!links||!links.linked_item_ids||links.linked_item_ids.length!==1||String(links.linked_item_ids[0])!==String(binding.itemId))throw Error('Exact installation relationship required');
 var country=market((values[m.countryColumn]||{}).text);if(country!==market(binding.country))throw Error('Market mismatch');
 if(c.operation==='issue'&&((values[m.fzeEmailColumn]||{}).text!==c.fzeEmail||(values[m.mfpEmailColumn]||{}).text!==c.mfpEmail||String(item.name).trim()!==binding.store))throw Error('Recipient/store source mismatch');
 var value=JSON.parse((values[m.installDateColumn]||{}).value||'null');if(!value||value.date!==binding.installDate)throw Error('Install date changed');
 var evidence=RD_projectEvidence_(item,p);
 if(binding.projectType!==evidence.projectType||binding.installType!==evidence.installType)throw Error('Invitation context differs from Monday');
 c.sourceVerified=true;c.sourceReference={brainItemId:item.id,verifiedAt:new Date().toISOString(),projectEvidence:evidence};
}
function RD_submit_(previous,c,save,p){
 if(p.getProperty('RD_WRITES_APPROVED')!=='YES')throw Error('Submission filing not activated');
 RD_assertCurrent_(previous,p);
 var start=reduce(previous,Object.assign({},c,{operation:'beginSubmission'}),Date.now());
 if(start.result.completed)return {at:start.result.at,duplicate:true};
 var r=start.record;save(r);
 if(!start.result.reserved)throw Error('Previous submission must be reconciled; no blind retry');
 // Record phase BEFORE every external side effect. Uncertain outcomes never repeat automatically.
 var archiveFolder=DriveApp.getFolderById(p.getProperty('RD_ARCHIVE_FOLDER_ID'));
 r.pendingSubmission.phase='archive-started';save(r);
 var names=(c.files||[]).map(function(f,i){
  if(['image/jpeg','image/png'].indexOf(f.mime)<0||!f.data||f.data.length>970000)throw Error('Invalid evidence');
  var bytes=Utilities.base64Decode(f.data);if(bytes.length>716800)throw Error('Photo too large');
  var ext=f.mime==='image/png'?'.png':'.jpg',name=r.binding.id+'-'+c.submissionId+'-'+i+ext;
  var file=archiveFolder.createFile(Utilities.newBlob(bytes,f.mime,name));return {id:file.getId(),name:f.name,mime:f.mime,category:f.category};
 });
 var archive={binding:r.binding,revision:r.revision,submissionId:c.submissionId,at:r.pendingSubmission.at,answers:r.pendingSubmission.answers,files:names,acknowledgement:r.pendingSubmission.acknowledgement,digest:c.digest};
 var archiveFile=archiveFolder.createFile(r.binding.id+'-'+c.submissionId+'.json',JSON.stringify(archive),'application/json');
 if(archiveFile.getBlob().getDataAsString()!==JSON.stringify(archive))throw Error('Archive verification failed');
 r.pendingSubmission.archiveId=archiveFile.getId();r.pendingSubmission.files=names;r.pendingSubmission.phase='monday-started';save(r);
 var country=market(r.binding.country),board={UK:'18379251681',IE:'18379251681',DE:'18391075175',NL:'18396748434'}[country],a=r.pendingSubmission.answers;
 var labels={UK:{yes:'Yes',no:'No',pending:'No'},IE:{yes:'Yes',no:'No',pending:'No'},DE:{yes:'Ja',no:'Nein',pending:'Nein'},NL:{yes:'Ja',no:'Nee',pending:'Nee'}}[country];
 var columns={short_textjluohkcj:r.binding.store,dateil43at5z:{date:r.pendingSubmission.at.slice(0,10)},short_text2q1abstd:a.name,long_textre3ommqp:{text:a.comments}};
 ['team','area','powerData','peds'].forEach(function(k,i){var ids=['single_selectxvq1oc5','single_selectfmp3ddo','single_selectyvczs4q','single_selectdfcews6'];var label=labels[a[k]];if(country==='DE'&&k==='peds'&&a[k]!=='yes')label='No';if(country==='NL'&&(k==='powerData'||k==='peds')&&a[k]==='yes')label='Jaa';columns[ids[i]]={label:label};});
 var tableId={UK:'single_select9i5gdtk',IE:'single_select9i5gdtk',DE:'single_selectztongf2',NL:'single_selectojxswdf'}[country];
 if(r.binding.installType==='sfk')columns[tableId]={label:country==='NL'&&a.table==='yes'?'Jaa':labels[a.table]};
 var floorId={UK:'single_selecteeh7rio',IE:'single_selecteeh7rio',DE:'single_selectfc2hq66',NL:'single_selectabkgsdx'}[country];columns[floorId]={label:labels[a.floorplan]};
 var result=RD_monday_('mutation($b:ID!,$n:String!,$v:JSON!){create_item(board_id:$b,item_name:$n,column_values:$v){id}}',{b:board,n:r.binding.store,v:JSON.stringify(columns)},p),itemId=result.create_item.id;
 r.pendingSubmission.mondayItemId=itemId;r.pendingSubmission.phase='metadata-started';save(r);
 // Exact binding/canonical answers retained in an update, separate from visible FZE comments.
 RD_monday_('mutation($i:ID!,$body:String!){create_update(item_id:$i,body:$body){id}}',{i:itemId,body:'READINESS_PORTAL_V1\n'+JSON.stringify({binding:r.binding,revision:r.revision,submissionId:c.submissionId,at:archive.at,answers:a,acknowledgement:archive.acknowledgement,archiveId:archiveFile.getId(),files:names})},p);
 var committed=reduce(r,Object.assign({},c,{operation:'commitSubmission',archiveId:archiveFile.getId(),mondayItemId:itemId,files:names}),Date.now());save(committed.record);return committed.result;
}
/** Call from the existing reviewed readiness sender. No trigger or new sender here.
 * sender must return {sentMessageId,receiptVerified:true} only after Gmail Sent reconciliation.
 * Reservations survive errors; operator reconciliation is required before retry.
 */
function RD_dispatchWithExistingSender(recordId,portalUrl,sender){
 var p=PropertiesService.getScriptProperties();if(p.getProperty('RD_SEND_APPROVED')!=='YES'||typeof sender!=='function')throw Error('Sending disabled');
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Busy');
 try{
  var folder=DriveApp.getFolderById(p.getProperty('RD_STATE_FOLDER_ID')),file=RD_find_(folder,recordId+'.json');if(!file)throw Error('Request missing');
  var r=JSON.parse(file.getBlob().getDataAsString());RD_assertCurrent_(r,p);var today=Utilities.formatDate(new Date(),'Europe/London','yyyy-MM-dd'),plan=planReminder(r,today);
  if(plan.state!=='due')return plan;
  var reserved=reduce(r,{operation:'reserveMail',today:today,key:plan.key},Date.now());file.setContent(JSON.stringify(reserved.record));
  var copy=emailPreview(r,plan,portalUrl),receipt=sender(copy,plan.key);
  if(!receipt||!receipt.receiptVerified||!receipt.sentMessageId)throw Error('Outcome uncertain; reconcile Gmail Sent before retry');
  var sent=reduce(reserved.record,{operation:'confirmSent',key:plan.key,today:today,sentMessageId:receipt.sentMessageId,receiptVerified:true},Date.now());file.setContent(JSON.stringify(sent.record));return sent.result;
 }finally{lock.releaseLock();}
}

function RD_assertCurrent_(record,p){
 if(!record)throw Error('Request missing');
 var b=record.binding, data=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id name board{id} column_values{id text value}}}',{ids:[b.itemId]},p),i=data.items[0];
 if(!i||String(i.board.id)!==b.boardId||String(i.name).trim()!==b.store)throw Error('Installation identity changed');
 var cols={};i.column_values.forEach(function(v){cols[v.id]=v;});
 var dateCol={UK:'date',IE:'date1__1',NL:'date',DE:'date3'}[market(b.country)],phaseCol=market(b.country)==='IE'?'status__1':'status';
 var date=JSON.parse((cols[dateCol]||{}).value||'null'),phase=(cols[phaseCol]||{}).text||'';
 RD_assertProjectCurrent_(record,p);
 if(!date||date.date!==b.installDate||/cancel|postpon|on.?hold|abort|partial|revisit|complete|hypercare|installed|live/i.test(phase))throw Error('Installation changed or no longer pending; reconcile invitation');
}

// Verified schema on 28 October 2026. Exact Brain→Sign Up identity, no name matching.
function RD_projectEvidence_(brain,p){
 if(String(brain.board.id)!=='18432365825')throw Error('Project source must be the verified Brain board');
 var v={};brain.column_values.forEach(function(c){v[c.id]=c;});
 var link=v.board_relation_mm7s293s;if(!link||!link.linked_item_ids||link.linked_item_ids.length!==1)throw Error('Exactly one linked Sign Up store required');
 var signup=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id board{id} column_values{id text value}}}',{ids:[String(link.linked_item_ids[0])]},p).items[0];
 if(!signup||String(signup.board.id)!=='5678025992')throw Error('Sign Up source identity mismatch');
 var s={};signup.column_values.forEach(function(c){s[c.id]=c;});
 var raw=[(v.color_mm7f7r9d||{}).text,(s.dup__of_store_type5__1||{}).text];
 if((s.label7||{}).text)raw.push(s.label7.text);
 return {projectType:verifiedProjectType(raw),installType:equipmentScopeFromSources((v.dropdown_mm7ftf76||{}).text,[(s.color_mkwjhm4b||{}).text,(s.dup__of_layout_type_bau1__1||{}).text]),brainProjectColumn:'color_mm7f7r9d',signupItemId:String(signup.id),signupOpeningColumn:'dup__of_store_type5__1',signupProjectColumn:'label7',rawLabels:raw};
}
function RD_assertProjectCurrent_(record,p){
 var id=(record.sourceReference||{}).brainItemId;if(!id)throw Error('Verified Brain project binding required');
 var item=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id board{id} column_values{id text value ... on BoardRelationValue{linked_item_ids}}}}',{ids:[String(id)]},p).items[0];
 if(!item)throw Error('Brain source unavailable');
 var proof=RD_projectEvidence_(item,p);
 if(proof.projectType!==record.binding.projectType||proof.installType!==record.binding.installType)throw Error('Project or equipment context changed; replace invitation');
 if((record.sourceReference.projectEvidence||{}).signupItemId&&record.sourceReference.projectEvidence.signupItemId!==proof.signupItemId)throw Error('Linked Sign Up store changed');
}
