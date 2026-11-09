function RD_portalLink_(record,p) {
  const origin=p.getProperty('RD_PORTAL_URL')||'';
  const secret=p.getProperty('RD_LINK_SECRET')||'';
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(origin)||
     secret.length<32||record.expires<=Date.now())throw Error('Approved readiness portal and unexpired request required');
  const payload=Utilities.base64EncodeWebSafe(JSON.stringify({id:record.binding.id,revision:record.revision,expires:record.expires}),Utilities.Charset.UTF_8).replace(/=+$/,'');
  const token=payload+'.'+RD_mac_(secret,payload);
  if(!RD_equal_(RD_hash_(token),record.tokenHash))throw Error('Stored readiness link does not match');
  return origin+'#access='+token;
}

function RD_sendGmailVerified_(copy) {
  const owner='subway.emea@vitamojo.com';
  if(Session.getEffectiveUser().getEmail().toLowerCase()!==owner||typeof Gmail==='undefined')throw Error('Approved Gmail sender required');
  const raw=RD_gmailMime_(copy,owner);
  const sent=Gmail.Users.Messages.send({raw},'me');
  const id=sent&&sent.id;
  if(!id)throw Error('Gmail send returned no message ID');
  const headers=['From','To','Cc','Subject'];
  const proof=Gmail.Users.Messages.get('me',id,{format:'metadata',metadataHeaders:headers});
  if(!RD_matchesGmailReceipt_(proof,id,copy,owner))throw Error('Gmail Sent receipt unconfirmed');
  return {sentMessageId:id,receiptVerified:true};
}

function RD_gmailMime_(copy,owner) {
  const mailbox=/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
  if(!mailbox.test(owner)||!mailbox.test(copy.to)||
     (copy.cc&&!copy.cc.split(',').every(part=>mailbox.test(part.trim())))||
     typeof copy.subject!=='string'||!copy.subject||/[\r\n]/.test(copy.subject))throw Error('Invalid mail headers');
  const boundary='rd_'+Utilities.getUuid().replace(/-/g,'');
  const headers=['From: '+owner,'To: '+copy.to];
  if(copy.cc)headers.push('Cc: '+copy.cc);
  headers.push('Subject: '+RD_gmailSubject_(copy.subject),'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="'+boundary+'"','');
  const parts=[['text/plain',copy.text],['text/html',copy.html]].flatMap(([type,body])=>{
    const encoded=Utilities.base64Encode(body,Utilities.Charset.UTF_8);
    return ['--'+boundary,'Content-Type: '+type+'; charset=UTF-8',
      'Content-Transfer-Encoding: base64','',(encoded.match(/.{1,76}/g)||[]).join('\r\n')];
  });
  return Utilities.base64EncodeWebSafe([...headers,'',...parts,'--'+boundary+'--',''].join('\r\n'),Utilities.Charset.UTF_8).replace(/=+$/,'');
}

function RD_gmailSubject_(subject){
  if(/^[ -~]{1,68}$/.test(subject))return subject;
  const words=[];
  let chunk='';
  for(const char of subject){
    if(Utilities.newBlob(chunk+char).getBytes().length>42){
      words.push('=?UTF-8?B?'+Utilities.base64Encode(chunk,Utilities.Charset.UTF_8)+'?=');
      chunk='';
    }
    chunk+=char;
  }
  if(chunk)words.push('=?UTF-8?B?'+Utilities.base64Encode(chunk,Utilities.Charset.UTF_8)+'?=');
  return words.join('\r\n ');
}

function RD_matchesGmailReceipt_(message,id,copy,owner) {
  if(!message||message.id!==id||!(message.labelIds||[]).includes('SENT'))return false;
  const headers=message.payload?.headers||[];
  function header(name){
    const values=headers.filter(entry=>entry.name.toLowerCase()===name);
    return values.length===1?values[0].value:values.length===0?'':null;
  }
  function addresses(value){
    if(typeof value!=='string')return null;
    if(!value.trim())return '';
    const addresses=value.split(',').map(part=>{
      const address=(part.match(/<([^<>]+)>\s*$/)||[])[1]||part.trim();
      return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(address)?address.toLowerCase():null;
    });
    return addresses.includes(null)?null:addresses.sort().join(',');
  }
  const cc=addresses(header('cc')),to=addresses(copy.to);
  return Boolean(to)&&addresses(header('from'))===owner&&addresses(header('to'))===to&&
    cc!==null&&cc===addresses(copy.cc||'')&&RD_matchesGmailSubject_(header('subject'),copy.subject);
}

function RD_matchesGmailSubject_(actual,expected){
  if(actual===expected)return true;
  return typeof actual==='string'&&actual.replace(/\r?\n[ \t]+/g,' ')===RD_gmailSubject_(expected).replace(/\r?\n[ \t]+/g,' ');
}

function RD_runReadinessMailWorker_() {
  const p=PropertiesService.getScriptProperties();
  if(!['RD_ENABLED','RD_PORTAL_ENABLED','RD_WRITES_APPROVED','RD_SEND_APPROVED'].every(key=>p.getProperty(key)==='YES'))return {state:'disabled'};
  const cohort=RD_standDownCohort_(p);
  const folder=DriveApp.getFolderById(p.getProperty('RD_STATE_FOLDER_ID'));
  const today=Utilities.formatDate(new Date(),'Europe/London','yyyy-MM-dd');
  const deadline=Date.now()+120000,results=[];
  for(const entry of cohort){
    if(Date.now()>=deadline)break;
    try{
      const file=RD_find_(folder,entry.id+'.json');
      if(!file)throw Error('Issued readiness request missing');
      const record=JSON.parse(file.getBlob().getDataAsString());
      RD_assertStandDownBinding_(record,entry);
      if(record.pendingMail||record.pendingSubmission){results.push({id:entry.id,state:'held'});continue;}
      if(planReminder(record,today).state!=='due')continue;
      const result=RD_dispatchWithExistingSender_(entry.id,current=>{
        RD_assertStandDownBinding_(current,entry);
        return RD_portalLink_(current,p);
      },RD_sendGmailVerified_);
      results.push({id:entry.id,state:result.confirmed?'sent':result.state});
    }catch(error){
      results.push({id:entry.id,state:'held',reason:String(error.message||'Unconfirmed dispatch').slice(0,150)});
      console.log(JSON.stringify({state:'halted',results}));
      return {state:'halted',results};
    }
  }
  console.log(JSON.stringify({state:'complete',results}));
  return {state:'complete',results};
}
