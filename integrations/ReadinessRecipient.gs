// Public web-app shell. The signed fragment is passed only to the server bridge.
function doGet() {
  if (PropertiesService.getScriptProperties().getProperty('RD_PORTAL_ENABLED') !== 'YES') {
    return HtmlService.createHtmlOutput('Readiness portal is currently unavailable.');
  }
  return HtmlService.createHtmlOutputFromFile('ReadinessPortal')
    .setTitle('Subway installation readiness')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function RD_recipientRequest(token, request) {
  const p = PropertiesService.getScriptProperties();
  try {
    if (p.getProperty('RD_PORTAL_ENABLED') !== 'YES' || p.getProperty('RD_ENABLED') !== 'YES') throw Error();
    const access = RD_recipientAccess_(token, p);
    if (!request || !['open', 'submit', 'reportProjectMismatch'].includes(request.operation)) throw Error();
    const command = Object.assign({}, access, {operation: request.operation});
    if (command.operation === 'reportProjectMismatch') {
      if (typeof request.reason !== 'string' || request.reason.trim().length < 5 || request.reason.length > 1000) throw Error();
      command.reason = request.reason.trim();
    }
    if (command.operation === 'submit') {
      if (request.answers?.schemaVersion !== 2 || !/^[a-zA-Z0-9-]{16,80}$/.test(request.submissionId || '')) throw Error();
      const opened = RD_recipientRpc_(Object.assign({}, access, {operation:'open'}), p);
      command.files = RD_recipientFiles_(request.files || []);
      command.answers = validateAnswers(Object.assign({},request.answers,{evidenceCategories:command.files.map(file=>file.category)}), opened.binding.installType, opened.binding);
      command.submissionId = request.submissionId;
      command.digest = RD_hash_(JSON.stringify({answers:command.answers,files:command.files}));
    }
    return RD_recipientRpc_(command, p);
  } catch (error) {
    throw Error('Link or update unavailable. Contact the installation team if retry fails.');
  }
}

function RD_recipientAccess_(token,p) {
  const secret=p.getProperty('RD_LINK_SECRET')||'';
  if(secret.length<32||typeof token!=='string'||token.length>1000)throw Error('Invalid link');
  const parts=token.split('.');
  if(parts.length!==2||!/^[a-zA-Z0-9_-]+$/.test(parts[0])||!RD_equal_(RD_mac_(secret,parts[0]),parts[1]))throw Error('Invalid link');
  const access=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(access.id||'')||!Number.isSafeInteger(access.revision)||access.revision<1||
      !Number.isSafeInteger(access.expires)||access.expires<=Date.now())throw Error('Expired link');
  return {id:access.id,revision:access.revision,tokenHash:RD_hash_(token)};
}

function RD_recipientRpc_(command,p) {
  const secret=p.getProperty('RD_RPC_SECRET')||'';
  if(secret.length<32)throw Error('Coordinator unavailable');
  const nonce=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
  const timestamp=Date.now(),payload=JSON.stringify(command);
  const mac=RD_mac_(secret,timestamp+'\n'+nonce+'\n'+payload);
  const envelope=JSON.parse(doPost({postData:{contents:JSON.stringify({nonce,timestamp,payload,mac})}}).getContent());
  if(envelope.nonce!==nonce||!RD_equal_(RD_mac_(secret,nonce+'\n'+envelope.payload),envelope.mac))throw Error('Coordinator response invalid');
  const response=JSON.parse(envelope.payload);
  if(!response.ok)throw Error('Coordinator rejected request');
  return response.result;
}

function RD_recipientFiles_(files) {
  if(!Array.isArray(files)||files.length>4)throw Error('Maximum four photos');
  const categories=new Set();
  return files.map(file=>{
    if(!file||!['image/png','image/jpeg'].includes(file.mime)||typeof file.name!=='string'||file.name.length>150||
       !['table','powerData','peds','kit'].includes(file.category)||categories.has(file.category)||
       typeof file.data!=='string'||file.data.length>956000||!/^[A-Za-z0-9+/]+={0,2}$/.test(file.data))throw Error('Invalid photo');
    const bytes=Utilities.base64Decode(file.data);
    const magic=file.mime==='image/png'?[137,80,78,71,13,10,26,10]:[255,216,255];
    if(bytes.length<8||bytes.length>716800||!magic.every((byte,index)=>(bytes[index]&255)===byte))throw Error('Invalid photo format');
    categories.add(file.category);
    return {category:file.category,mime:file.mime,name:file.name.replace(/[^a-zA-Z0-9._ -]/g,'_'),data:file.data};
  });
}
