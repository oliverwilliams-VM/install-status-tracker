const RANK={unknown:0,awaiting:1,signed:2,submitted:3,ordered:4,shipped:5,delivered:6};
export function legacyPed(raw='') {
 const label=String(raw).trim();
 if(/^PEDs delivered$/i.test(label))return {stage:'delivered',label:'Delivered',received:'Yes'};
 if(/^PEDs shipped$/i.test(label))return {stage:'shipped',label:'Shipped — awaiting receipt',ordered:'Yes'};
 if(/^Form sent to Fiserv$/i.test(label))return {stage:'submitted',label:'Submitted to supplier — delivery unconfirmed',submitted:true};
 if(/^Form returned to VM$/i.test(label))return {stage:'signed',label:'Signed — awaiting supplier submission',signed:'Yes'};
 if(/^FZE Ordered$/i.test(label))return {stage:'ordered',label:'FZE ordered — delivery unconfirmed',ordered:'Yes'};
 if(/^Form sent to FZE$|^Chase [123] sent/i.test(label))return {stage:'awaiting',label:'Awaiting signed form'};
 if(/blocked|rejected|on hold/i.test(label))return {stage:'review',label:'Needs review',conflict:true};
 return {stage:'unknown',label:'Needs review'};
}
export function reconcilePed({legacyRaw='',snapshot=null,binding={},signed='Unknown',ordered='Unknown',received='Unknown',sourceUrl='',sourceColumn='',sourceUpdatedAt='',observedAt=''}) {
 const matches=snapshot&&['store','market','boardId','itemId','installDate'].every(k=>String(snapshot[k]||'')===String(binding[k]||''));
 const raw=legacyRaw||(matches?snapshot.rawStatus:'')||'';
 const legacy=legacyPed(raw);
 const current={stage:received==='Yes'?'delivered':ordered==='Yes'?'ordered':signed==='Yes'?'signed':'unknown'};
 const conflict=legacy.conflict||(received==='No'&&legacy.stage==='delivered');
 const stage=conflict?'review':(RANK[current.stage]>RANK[legacy.stage]?current.stage:legacy.stage);
 const evidence=raw?{version:1,...binding,rawStatus:raw,stage:legacy.stage,label:legacy.label,sourceUrl,sourceColumn:legacyRaw?sourceColumn:snapshot.sourceColumn,sourceUpdatedAt:legacyRaw?sourceUpdatedAt:snapshot.sourceUpdatedAt,observedAt:legacyRaw?observedAt:snapshot.observedAt}:null;
 const labels={unknown:'Needs review',awaiting:'Awaiting signed form',signed:'Signed — awaiting supplier submission',submitted:'Submitted to supplier — delivery unconfirmed',ordered:'Ordered — delivery unconfirmed',shipped:'Shipped — awaiting receipt',delivered:'Delivered',review:'Needs review'};
 return {signed:signed==='Yes'?'Yes':legacy.signed||signed,ordered:ordered==='Yes'?'Yes':legacy.ordered||ordered,received:received==='Yes'||received==='No'?received:legacy.received||received,
 stage,label:stage===legacy.stage?legacy.label:labels[stage],conflict:Boolean(conflict),evidence,source:stage===legacy.stage&&evidence?'Historical Monday evidence':current.stage!=='unknown'?'Current workflow / FZE response':'No confirmed PED evidence'};
}
