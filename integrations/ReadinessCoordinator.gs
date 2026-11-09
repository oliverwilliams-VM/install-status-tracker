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
 var m=JSON.parse(p.getProperty('RD_SOURCE_MAP')||'null');if(!m||!m.brainBoardId||!m.countryColumn||!m.fzeEmailColumn||!m.installDateColumn)throw Error('Verified Brain source mapping required');
 if(!/^\d+$/.test(String(c.brainItemId||'')))throw Error('Bound Brain item required');
 var data=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id name board{id} column_values{id text value ... on BoardRelationValue{linked_item_ids}}}}',{ids:[String(c.brainItemId)]},p),item=data.items[0];
 if(!item||String(item.board.id)!==String(m.brainBoardId))throw Error('Brain identity mismatch');
 var values={};item.column_values.forEach(function(v){values[v.id]=v;});
 var binding=c.binding;if(c.operation==='reschedule')binding=Object.assign({},previous.binding,{installDate:c.installDate});
 if(m.installLinkColumn){
  var links=values[m.installLinkColumn];
  if(!links||!links.linked_item_ids||links.linked_item_ids.length!==1||String(links.linked_item_ids[0])!==String(binding.itemId))throw Error('Exact installation relationship required');
 }
 var country=market((values[m.countryColumn]||{}).text);if(country!==market(binding.country))throw Error('Market mismatch');
 if(c.operation==='issue'&&((values[m.fzeEmailColumn]||{}).text!==c.fzeEmail||String(item.name).trim()!==binding.store))throw Error('Recipient/store source mismatch');
 var value=JSON.parse((values[m.installDateColumn]||{}).value||'null');if(!value||value.date!==binding.installDate)throw Error('Install date changed');
 var evidence=RD_projectEvidence_(item,p,c.operation==='issue');
 if(!m.installLinkColumn)RD_assertInstallSignup_(binding,evidence.signupItemId,p);
 if(c.operation==='issue'){
  var verifiedMfp=m.mfpEmailColumn?(values[m.mfpEmailColumn]||{}).text:RD_assigneeEmail_(evidence.mfpPersonId,p);
  if(c.mfpEmail&&c.mfpEmail!==verifiedMfp)throw Error('MFP source mismatch');
  c.mfpEmail=verifiedMfp;
  var verifiedHfp=RD_assigneeEmail_(evidence.hfpPersonId,p);
  if(c.hfpEmail&&c.hfpEmail!==verifiedHfp)throw Error('HFP source mismatch');
  c.hfpEmail=verifiedHfp;
 }
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
 var board='18438991769',columns=RD_responseColumns_(r,archive);
 var result=RD_monday_('mutation($b:ID!,$n:String!,$v:JSON!){create_item(board_id:$b,item_name:$n,column_values:$v){id}}',{b:board,n:r.binding.store,v:JSON.stringify(columns)},p),itemId=result.create_item.id;
 r.pendingSubmission.mondayItemId=itemId;r.pendingSubmission.phase='metadata-started';save(r);
 var readback=RD_monday_('query($ids:[ID!]!,$cols:[String!]){items(ids:$ids){board{id} column_values(ids:$cols){id text}}}',{ids:[String(itemId)],cols:[RD_RESPONSE_COLUMNS_['Submission ID'],RD_RESPONSE_COLUMNS_['Response Digest']]},p).items[0];
 var verified={};if(readback)readback.column_values.forEach(function(v){verified[v.id]=v.text;});
 if(!readback||String(readback.board.id)!==board||verified[RD_RESPONSE_COLUMNS_['Submission ID']]!==c.submissionId||verified[RD_RESPONSE_COLUMNS_['Response Digest']]!==c.digest)throw Error('Response board readback unconfirmed');
 // Exact binding/canonical answers retained in an update, separate from visible FZE comments.
 RD_monday_('mutation($i:ID!,$body:String!){create_update(item_id:$i,body:$body){id}}',{i:itemId,body:'READINESS_PORTAL_V1\n'+JSON.stringify({binding:r.binding,revision:r.revision,submissionId:c.submissionId,at:archive.at,answers:archive.answers,acknowledgement:archive.acknowledgement,archiveId:archiveFile.getId(),files:names})},p);
 var committed=reduce(r,Object.assign({},c,{operation:'commitSubmission',archiveId:archiveFile.getId(),mondayItemId:itemId,files:names}),Date.now());save(committed.record);return committed.result;
}
/** Call from the existing reviewed readiness sender. No trigger or new sender here.
 * sender must return {sentMessageId,receiptVerified:true} only after Gmail Sent reconciliation.
 * Reservations survive errors; operator reconciliation is required before retry.
 */
function RD_dispatchWithExistingSender(recordId,portalUrl,sender,standDownEntry){
 var p=PropertiesService.getScriptProperties();
 var sending=p.getProperty('RD_SEND_APPROVED')==='YES'&&typeof sender==='function';
 var standDownAlerts=p.getProperty('RD_STAND_DOWN_ALERTS_APPROVED')==='YES';
 if(!sending&&!standDownAlerts)throw Error('Sending and stand-down alerts disabled');
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Busy');
 try{
  var folder=DriveApp.getFolderById(p.getProperty('RD_STATE_FOLDER_ID')),file=RD_find_(folder,recordId+'.json');if(!file)throw Error('Request missing');
  var r=JSON.parse(file.getBlob().getDataAsString());RD_assertCurrent_(r,p);var today=Utilities.formatDate(new Date(),'Europe/London','yyyy-MM-dd'),plan=planReminder(r,today);
  if(standDownEntry){
   RD_assertStandDownBinding_(r,standDownEntry);
   if(Date.now()<Date.parse(standDownEntry.notBefore))return {state:'waiting'};
  }
  if(plan.state==='standDown'&&standDownAlerts&&standDownEntry)return RD_alertStandDown_(r,file,plan,p);
  if(plan.state!=='due')return plan;
  if(!sending)return {state:'blocked',reason:'Readiness emails disabled'};
  if(plan.stage==='finalWarning')RD_verifySource_({operation:'issue',binding:r.binding,brainItemId:r.sourceReference&&r.sourceReference.brainItemId,fzeEmail:r.fzeEmail,mfpEmail:r.mfpEmail,hfpEmail:r.hfpEmail},p);
  var reserved=reduce(r,{operation:'reserveMail',today:today,key:plan.key},Date.now());file.setContent(JSON.stringify(reserved.record));
  var copy=emailPreview(r,plan,portalUrl),receipt=sender(copy,plan.key);
  if(!receipt||!receipt.receiptVerified||!receipt.sentMessageId)throw Error('Outcome uncertain; reconcile Gmail Sent before retry');
  var sent=reduce(reserved.record,{operation:'confirmSent',key:plan.key,today:today,sentMessageId:receipt.sentMessageId,receiptVerified:true},Date.now());file.setContent(JSON.stringify(sent.record));return sent.result;
 }finally{lock.releaseLock();}
}

// Called under the dispatch lock after verifying the current installation.
function RD_alertStandDown_(r,file,plan,p){
 if(r.pendingSubmission)return {state:'blocked',reason:'Readiness submission requires reconciliation'};
 var ids=(p.getProperty('RD_STAND_DOWN_USER_IDS')||'').split(',').map(function(id){return id.trim();});
 if(ids.length!==2||ids[0]===ids[1]||ids.some(function(id){return !/^\d+$/.test(id);}))throw Error('Two verified internal stand-down recipients required');
 if(!r.standDownAlert||r.standDownAlert.revision!==r.revision)r.standDownAlert={revision:r.revision,recipients:{}};
 var alerts=r.standDownAlert.recipients;
 var message='Readiness action for store '+r.binding.store+' (install '+r.binding.installDate+'). Recheck the latest franchisee response and warning history. If still outstanding and due for cancellation, cancel the booking and tell Apex to stand down. Record the cancellation and Apex confirmation on the install item.';
 function save(){
  var encoded=JSON.stringify(r);
  file.setContent(encoded);
  if(file.getBlob().getDataAsString()!==encoded)throw Error('Stand-down alert state write unconfirmed');
 }
 ids.forEach(function(id){
  // An uncertain notification stays reserved for manual reconciliation.
  if(alerts[id])return;
  alerts[id]='uncertain';
  save();
  var result=RD_monday_('mutation($user:ID!,$item:ID!,$message:String!){create_notification(user_id:$user,target_id:$item,target_type:Project,text:$message){text}}',{user:id,item:r.binding.itemId,message:message},p);
  if(!result.create_notification||result.create_notification.text!==message)throw Error('Stand-down notification acceptance unconfirmed');
  alerts[id]='accepted';
  save();
 });
 return Object.assign({},plan,{notificationsAccepted:ids.filter(function(id){return alerts[id]==='accepted';}).length,notificationOutcomeUncertain:ids.some(function(id){return alerts[id]==='uncertain';})});
}

function RD_assertCurrent_(record,p){
 if(!record)throw Error('Request missing');
 var b=record.binding, data=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id name board{id} column_values{id text value}}}',{ids:[b.itemId]},p),i=data.items[0];
 if(!i||String(i.board.id)!==b.boardId||String(i.name).trim()!==b.store)throw Error('Installation identity changed');
 var cols={};i.column_values.forEach(function(v){cols[v.id]=v;});
 var dateCol={UK:'date',IE:'date1__1',NL:'date',DE:'date3'}[market(b.country)],phaseCol=market(b.country)==='IE'?'status__1':'status';
 var date=JSON.parse((cols[dateCol]||{}).value||'null'),phase=(cols[phaseCol]||{}).text||'';
 var evidence=RD_assertProjectCurrent_(record,p);
 if(!date||date.date!==b.installDate||/cancel|postpon|on.?hold|abort|partial|revisit|complete|hypercare|installed|live/i.test(phase))throw Error('Installation changed or no longer pending; reconcile invitation');
 var mapping=JSON.parse(p.getProperty('RD_SOURCE_MAP')||'null');
 if(mapping&&!mapping.installLinkColumn)RD_assertInstallSignup_(b,evidence.signupItemId,p);
}


// Verified schema on 28 October 2026. Exact Brain→Sign Up identity, no name matching.
function RD_projectEvidence_(brain,p,includeRecipients){
 if(String(brain.board.id)!=='18432365825')throw Error('Project source must be the verified Brain board');
 var v={};brain.column_values.forEach(function(c){v[c.id]=c;});
 var link=v.board_relation_mm7s293s;if(!link||!link.linked_item_ids||link.linked_item_ids.length!==1)throw Error('Exactly one linked Sign Up store required');
 var signup=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id board{id} column_values{id text value ... on PeopleValue{persons_and_teams{id kind}}}}}',{ids:[String(link.linked_item_ids[0])]},p).items[0];
 if(!signup||String(signup.board.id)!=='5678025992')throw Error('Sign Up source identity mismatch');
 var s={};signup.column_values.forEach(function(c){s[c.id]=c;});
 var brainType=(v.color_mm7f7r9d||{}).text;
 var signupType=(s.dup__of_store_type5__1||{}).text;
 var signupProject=(s.label7||{}).text;
 // LEGO LAND is a concept. Its paired project label must explicitly say Remodel.
 if(String(signupType||'').trim().toUpperCase()==='LEGO LAND'&&
    String(signupProject||'').trim().toLowerCase()==='remodel')signupType=signupProject;
 // A missing Brain label can use two agreeing Sign Up fields. An explicit unknown or conflict still holds.
 var raw=brainType?[brainType,signupType]:[signupType,signupProject];
 if(brainType&&signupProject)raw.push(signupProject);
 function person(column){
  var assigned=(s[column]||{}).persons_and_teams||[];
  return includeRecipients&&assigned.length===1&&assigned[0].kind==='person'?String(assigned[0].id):'';
 }
 return {hfpPersonId:person('people2__1'),mfpPersonId:person('people__1'),projectType:verifiedProjectType(raw),installType:equipmentScopeFromSources((v.dropdown_mm7ftf76||{}).text,[(s.color_mkwjhm4b||{}).text,(s.dup__of_layout_type_bau1__1||{}).text]),brainProjectColumn:'color_mm7f7r9d',signupItemId:String(signup.id),signupOpeningColumn:'dup__of_store_type5__1',signupProjectColumn:'label7',rawLabels:raw};
}
function RD_assigneeEmail_(personId,p){
 if(!/^\d+$/.test(personId))return '';
 var users=RD_monday_('query($ids:[ID!]!){users(ids:$ids){id email enabled is_pending}}',{ids:[personId]},p).users;
 if(!users||users.length!==1||String(users[0].id)!==personId||users[0].enabled!==true||users[0].is_pending!==false)return '';
 var email=users[0].email||'';
 return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)?email:'';
}
function RD_assertProjectCurrent_(record,p){
 var id=(record.sourceReference||{}).brainItemId;if(!id)throw Error('Verified Brain project binding required');
 var item=RD_monday_('query($ids:[ID!]!){items(ids:$ids){id board{id} column_values{id text value ... on BoardRelationValue{linked_item_ids}}}}',{ids:[String(id)]},p).items[0];
 if(!item)throw Error('Brain source unavailable');
 var proof=RD_projectEvidence_(item,p);
 if(proof.projectType!==record.binding.projectType||proof.installType!==record.binding.installType)throw Error('Project or equipment context changed; replace invitation');
 if((record.sourceReference.projectEvidence||{}).signupItemId&&record.sourceReference.projectEvidence.signupItemId!==proof.signupItemId)throw Error('Linked Sign Up store changed');
 return proof;
}

function RD_assertInstallSignup_(binding,signupItemId,p){
 validateBinding(binding);
 var relation={UK:'board_relation1__1',DE:'board_relation1__1',NL:'board_relation6__1',IE:'board_relation_mkmq1n7'}[market(binding.country)];
 var data=RD_monday_('query($ids:[ID!]!,$cols:[String!]){items(ids:$ids){id name board{id} column_values(ids:$cols){... on BoardRelationValue{linked_items{id board{id}}}}}}',{ids:[binding.itemId],cols:[relation]},p);
 var item=data.items[0],values=item&&item.column_values||[];
 var links=values.length===1&&values[0].linked_items||[];
 var signup=links.filter(function(link){return link.board&&String(link.board.id)==='5678025992';});
 if(!item||String(item.id)!==binding.itemId||String(item.board.id)!==binding.boardId||
    String(item.name).trim()!==binding.store||signup.length!==1||String(signup[0].id)!==signupItemId){
  throw Error('Exact shared Sign Up relationship required');
 }
}



var RD_RESPONSE_COLUMNS_={"Name": "name", "Table Order Date": "date_mm8xa33p", "Form Version": "text_mm8x87v5", "Install Date": "date_mm8x392s", "Table Order Reference": "text_mm8xdy45", "BAU Board ID": "text_mm8xc23m", "Table Arrived": "text_mm8x8yq0", "PEDs Received": "text_mm8xt0r4", "Contact Email": "email_mm8xkb3f", "FZE Comments Original": "long_text_mm8xy9a6", "Power Completed": "text_mm8xptrh", "Market": "text_mm8xbd76", "Hardware Received": "text_mm8xgjx5", "Context Revision": "numeric_mm8xh9d2", "Project Type": "text_mm8xy2mw", "Network Ready": "text_mm8xt2fj", "Data Completed": "text_mm8xk980", "FZE Comments English": "long_text_mm8xc3a", "VM Review": "text_mm8xz749", "Table ETA": "date_mm8xxeqr", "Brain Item ID": "text_mm8x3ngr", "Store Number": "text_mm8x7mvx", "Hardware Complete": "text_mm8x8d80", "Submission ID": "text_mm8xd75c", "Answers JSON": "long_text_mm8xxgct", "BAU Item ID": "text_mm8xter7", "Kiosk Format": "text_mm8x1en9", "Table Ordered": "text_mm8xmw4g", "Translation State": "text_mm8x72qx", "Submitted At UTC": "text_mm8xm7v9", "Response Language": "text_mm8xpnqg", "Hardware Undamaged": "text_mm8xer9j", "Evidence": "file_mm8xfw3h", "Response Digest": "text_mm8xba0p", "Contact Name": "text_mm8x4hms", "Access Confirmed": "text_mm8xyw2y"};
function RD_responseColumns_(r,archive){
 var a=archive.answers,c=RD_RESPONSE_COLUMNS_,m=market(r.binding.country),out={};
 function set(title,value){if(value!==undefined&&value!==null&&value!=='')out[c[title]]=value;}
 function answer(v){return v==='yes'?'Yes':v==='no'?'No':v==='na'?'Not required':'Unknown';}
 function day(title,value){if(value)set(title,{date:dateOnly(value)});}
 set('Submission ID',archive.submissionId);set('Market',m);set('Store Number',r.binding.store);
 set('BAU Board ID',r.binding.boardId);set('BAU Item ID',r.binding.itemId);
 set('Brain Item ID',String((r.sourceReference||{}).brainItemId||''));
 day('Install Date',r.binding.installDate);set('Submitted At UTC',archive.at);set('Context Revision',r.revision);
 set('Form Version',String(a.schemaVersion||1));set('Contact Name',a.name);set('Project Type',r.binding.projectType);
 set('Kiosk Format',r.binding.installType==='sfk'?'SFK':'Other');
 set('Table Ordered',answer(r.binding.installType==='sfk'?a.table:'na'));
 set('Table Arrived',answer(r.binding.installType==='sfk'?a.tableInStore:'na'));
 day('Table Order Date',a.tableOrderDate);day('Table ETA',a.tableDelivery);
 set('PEDs Received',answer(a.peds));set('Power Completed',answer(a.powerCompleted||a.powerData));
 set('Data Completed',answer(a.dataCompleted||a.powerData));set('Hardware Received',answer(a.kitDelivered));
 set('Hardware Complete',answer(a.kitComplete));set('Hardware Undamaged',answer(a.kitUndamaged));
 set('Network Ready',answer(a.networkOnline));set('Access Confirmed',answer(a.accessConfirmed));
 set('FZE Comments Original',{text:a.comments||''});
 if(m==='UK'||m==='IE')set('FZE Comments English',{text:a.comments||''});
 set('Response Language',m==='DE'?'de':m==='NL'?'nl':'en');set('Translation State',m==='DE'||m==='NL'?'Pending':'Original is English');
 set('Answers JSON',{text:JSON.stringify(a)});set('Response Digest',archive.digest);set('VM Review','Pending');
 return out;
}
