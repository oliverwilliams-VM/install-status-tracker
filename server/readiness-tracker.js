import sources from './tracker-sources.json' with { type: 'json' };

import {reconcilePed} from './ped-legacy.js';
import {applyLegacyEvidence} from './legacy-readiness.js';
import {installReadiness} from './install-readiness.js';

const BRAIN_ID = '18432365825';
const BRAIN_COLUMNS = ['board_relation_mm7s293s','country_mm7fphac','boolean_mm8q7cvs','boolean_mm8qvyqt','boolean_mm8qa0fn','color_mm8daknj','lookup_mm8vv96a','color_mm7h7hf1','long_text_mm7fzxz1','date_mm7f8hw6','long_text_mm8xk5vw','long_text_mm8xeb55','text_mm8xen8a','date_mm8xx6fr','color_mm8x8cxv','date_mm8x4m1e','text_mm8xs421','long_text_mm8xm0zp','link_mm8xxpv1'];
const SIGNUP_COLUMNS = ['hardware_placement','color_mm8ckctx'];
const CLOSED = new Set(['Closed','Revisit done','Waived']);
const GOOD_PHASE = /^(Complete|Installed|Installed\/Hypercare|Installed\/Hypercare|Hypercare|Live - Non-Integrated)$/i;
const ISSUE_PHASE = /revisit|abort|part.?install|installed - not live|stuck/i;
const YES = new Set(['yes','ja','jaa','true']);

export function values(item) {
  return Object.fromEntries((item.column_values || []).map(c => [c.id, c]));
}
function text(item, id) {
  const c = values(item)[id];
  try { const raw=JSON.parse(c?.value||'null'); if(typeof raw?.text==='string')return raw.text.trim(); } catch {}
  return String(c?.display_value ?? c?.text ?? '').trim();
}
function links(item, id) {
  const c = values(item)[id];
  return Array.isArray(c?.linked_item_ids) ? c.linked_item_ids.map(String) : [];
}
function date(item, id) {
  const c = values(item)[id];
  try { return JSON.parse(c?.value || 'null')?.date || ''; } catch { return ''; }
}
function checked(item, id) {
  const c = values(item)[id];
  try { return ['true', true].includes(JSON.parse(c?.value || 'null')?.checked); } catch { return false; }
}
function yesNo(v) {
  if (YES.has(String(v).toLowerCase())) return 'Yes';
  if (['no','nee','nein','false'].includes(String(v).toLowerCase())) return 'No';
  if (['na','not required'].includes(String(v).toLowerCase())) return 'Not required';
  return 'Unknown';
}
export function faultGroup(fault) {
  if (fault === 'Subway') return 'Subway';
  if (fault === 'Store') return 'FZE';
  if (['Vita Mojo','Apex','Supplier','Supplier / Apex','P&D contractor'].includes(fault)) return 'VM';
  return 'Unassigned';
}
function rowUrl(board, item) { return `https://vita-mojo-team.monday.com/boards/${board}/pulses/${item}`; }
function currentDate() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function fieldList(config) { return [...new Set(Object.values(config).filter(x=>typeof x === 'string' && !/^\d+$/.test(x)))]; }

export async function mondayRead(query, variables, {token, fetchImpl = fetch}) {
  const response = await fetchImpl('https://api.monday.com/v2', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:token,'API-Version':'2026-04'},
    body:JSON.stringify({query,variables}), signal:AbortSignal.timeout(22000)
  });
  const result = await response.json();
  if (!response.ok || result.errors || !result.data) throw Error('Monday source unavailable');
  return result.data;
}
export async function readBoard(board, columns, options) {
  const fields = 'id name created_at updated_at group{id title} column_values(ids:$columns){id text value ... on MirrorValue{display_value} ... on BoardRelationValue{linked_item_ids}}';
  const query = `query($board:ID!,$columns:[String!]){boards(ids:[$board]){items_page(limit:500){cursor items{${fields}}}}}`;
  const first = await mondayRead(query,{board,columns},options);
  if (!first.boards?.[0]?.items_page) throw Error('Monday board is not accessible');
  let page = first.boards[0].items_page;
  const rows = [...page.items];
  while (page.cursor) {
    const next = await mondayRead(`query($cursor:String!,$columns:[String!]){next_items_page(cursor:$cursor,limit:500){cursor items{${fields}}}}`,{cursor:page.cursor,columns},options);
    page = next.next_items_page;
    if (!page || !Array.isArray(page.items)) throw Error('Incomplete Monday board scan');
    rows.push(...page.items);
    if (rows.length > 20000) throw Error('Board exceeds tracker read limit');
  }
  return rows;
}
function responseShape(row) {
  const c = sources.responses.columns;
  let answers = {};
  try { answers = JSON.parse(text(row,c['Answers JSON']) || '{}'); } catch { /* Visible fields remain usable if the archive needs repair. */ }
  const at = text(row,c['Submitted At UTC']);
  return {
    id:row.id, submissionId:text(row,c['Submission ID']), at,
    market:text(row,c.Market), store:text(row,c['Store Number']), boardId:text(row,c['BAU Board ID']), itemId:text(row,c['BAU Item ID']),
    installDate:date(row,c['Install Date']), contact:text(row,c['Contact Name']), language:text(row,c['Response Language']),
    original:text(row,c['FZE Comments Original']), english:text(row,c['FZE Comments English']),
    translationState:text(row,c['Translation State']), answers,
    tableOrdered:yesNo(text(row,c['Table Ordered'])), tableArrived:yesNo(text(row,c['Table Arrived'])),
    received:yesNo(text(row,c['PEDs Received'])), power:yesNo(text(row,c['Power Completed'])), data:yesNo(text(row,c['Data Completed'])),
    hardware:yesNo(text(row,c['Hardware Received'])), network:yesNo(text(row,c['Network Ready'])), access:yesNo(text(row,c['Access Confirmed'])),
    tableOrderDate:date(row,c['Table Order Date']), tableEta:date(row,c['Table ETA']),
    review:text(row,c['VM Review']), url:rowUrl(sources.responses.id,row.id)
  };
}
function incidentShape(row) {
  const c = sources.incidents.columns;
  return {id:row.id,name:row.name,fault:text(row,c.fault),group:faultGroup(text(row,c.fault)),scenario:text(row,c.scenario),
    outcome:text(row,c.outcome),status:text(row,c.status),date:date(row,c.date),revisitDate:date(row,c.revisitDate),
    bauItems:links(row,c.bau),url:rowUrl(sources.incidents.id,row.id)};
}
export function joinTracker(raw, health = {}) {
  const responses = (raw.responses || []).map(responseShape);
  const incidents = (raw.incidents || []).map(incidentShape).filter(i=>i.status!=='Not an incident');
  const signups = new Map((raw.signup || []).map(i=>[String(i.id),i]));
  const brainBySignup = new Map();
  for (const brain of raw.brain || []) {
    for (const id of links(brain,'board_relation_mm7s293s')) {
      const list = brainBySignup.get(id) || []; list.push(brain); brainBySignup.set(id,list);
    }
  }
  const sites = [];
  for (const [market,config] of Object.entries(sources.countries)) {
    for (const row of raw[market] || []) {
      const store = row.name.trim();
      if (!/^\d{5}$/.test(store)) continue;
      const installDate = date(row,config.date);
      const signupLinks = links(row,config.signup);
      const signup = signupLinks.length === 1 ? signups.get(signupLinks[0]) : null;
      const candidates = signupLinks.length === 1 ? brainBySignup.get(signupLinks[0]) || [] : [];
      const brain = candidates.length === 1 ? candidates[0] : null;
      const sourceWarnings = [];
      if (candidates.length > 1) sourceWarnings.push('Multiple Brian jobs match this installation; PED milestones need reconciliation');
      const history = responses.filter(r=>r.boardId===config.id && r.itemId===String(row.id) && r.market===market && r.store===store)
        .filter(r=>r.at && Number.isFinite(Date.parse(r.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
      const response = history.find(r=>r.installDate===installDate) || null;
      const a = response?.answers || {};
      const sfk = /sfk|small.?format/i.test(text(row,config.format));
      const issueHistory = incidents.filter(i=>i.bauItems.includes(String(row.id)));
      const activeIssues = issueHistory.filter(i=>!CLOSED.has(i.status));
      const phase = text(row,config.phase);
      const good = GOOD_PHASE.test(phase);
      const issue = ISSUE_PHASE.test(phase) || activeIssues.length>0;
      let outcome = /abort/i.test(phase) ? 'Aborted' : /revisit/i.test(phase) ? 'Revisit required' : /part/i.test(phase) ? 'Installed with outstanding items' : good ? (/live|hypercare|complete/i.test(phase)?'Live':'Installed') : issue ? 'Issue under review' : /cancel|deinstall|postpon/i.test(phase) ? phase : 'Pending';
      if (good && activeIssues.length) outcome = 'Installed with outstanding items';
      const tableOrdered = response?.tableOrdered !== 'Unknown' && response?.tableOrdered ? response.tableOrdered :
        brain && /^ordered/i.test(text(brain,'color_mm8daknj')) ? 'Yes' : signup && /^ordered/i.test(text(signup,'color_mm8ckctx')) ? 'Yes' : (brain && /^not ordered$/i.test(text(brain,'color_mm8daknj'))) ? 'No' : 'Unknown';
      const hardwareStatus = text(row,config.hardware);
      const physical = response?.hardware !== 'Unknown' && response?.hardware ? response.hardware : /^(delivered|received)$/i.test(hardwareStatus) ? 'Yes' : 'Unknown';
      const legacyNotes=text(row,config.notes);
      const notes=brain?text(brain,'long_text_mm8xk5vw'):'';
      const readiness=installReadiness({date:installDate,complete:good&&!activeIssues.length,conflictingDate:brain&&date(brain,'date_mm7f8hw6')&&date(brain,'date_mm7f8hw6')!==installDate,sourcesHealthy:health.incidents?.ok!==false&&health.responses?.ok!==false,activeIssues:activeIssues.length,explicitOutstanding:[response?.received,response?.tableArrived,response?.power,response?.data,response?.hardware,response?.network,response?.access].includes('No')||Boolean(a.exceptionDetails&&!/^(none|n\/a|no issues)$/i.test(a.exceptionDetails)),siteStatus:text(row,config.siteStatus),decision:brain?text(brain,'color_mm8x8cxv'):'',decisionDate:brain?date(brain,'date_mm8x4m1e'):'',gate:text(row,config.readinessGate),blockReason:text(row,config.blockReason),responseApproved:response?.review==='Approved'&&[response?.received,response?.power,response?.data,response?.hardware,response?.network,response?.access,...(sfk?[response?.tableArrived]:[])].every(v=>v==='Yes')});
      let snapshot=null;try{snapshot=JSON.parse(brain?text(brain,'long_text_mm8xm0zp'):'null');}catch{}
      const ped=reconcilePed({legacyRaw:text(row,config.pedStatus),snapshot,binding:{store,market,boardId:config.id,itemId:String(row.id),installDate},signed:brain&&checked(brain,'boolean_mm8qvyqt')?'Yes':'Unknown',ordered:brain&&checked(brain,'boolean_mm8qa0fn')?'Yes':'Unknown',received:response?.received||'Unknown',sourceUrl:rowUrl(config.id,row.id),sourceColumn:config.pedStatus,sourceUpdatedAt:row.updated_at,observedAt:new Date().toISOString()});
      if(ped.conflict){sourceWarnings.push('Historical PED evidence conflicts with the current position; VM review required');if(!good){readiness.ready=false;readiness.label='Review needed';readiness.reason='Conflicting PED evidence needs VM review';}}
      sites.push({
        id:String(row.id),boardId:config.id,store,country:market,date:installDate,type:sfk?'SFK':'Standard',phase,
        dateStatus:text(row,config.dateStatus), outcome,attempted:good||issueHistory.length>0||ISSUE_PHASE.test(phase),hadIssue:issueHistory.length>0||ISSUE_PHASE.test(phase),
        signed:ped.signed,
        ordered:ped.ordered,
        invitationSent:brain ? checked(brain,'boolean_mm8q7cvs') : false,
        received:ped.received,ped,
        tableOrdered:sfk?tableOrdered:'Not required',tableArrived:sfk?(response?.tableArrived||'Unknown'):'Not required',
        tableOrderDate:response?.tableOrderDate||'',tableEta:response?.tableEta||'',
        tablePayment:brain?text(brain,'color_mm8daknj'):'',
        power:response?.power || 'Unknown',data:response?.data || 'Unknown',hardware:physical,
        network:response?.network || 'Unknown', access:response?.access || 'Unknown',
        floorplan:signup && text(signup,'hardware_placement')==='Done'?'Yes':brain && text(brain,'lookup_mm8vv96a')?'Yes':'Unknown',
        ia:links(row,config.ia).length?'Linked':'Unknown',
        readiness,brainId:brain?String(brain.id):'',brainDate:brain?date(brain,'date_mm7f8hw6'):'',notesSource:notes?'Brian':legacyNotes?'Legacy BAU':'Brian',legacyVm:legacyNotes,vm:notes||legacyNotes,phone:text(row,config.feedback),action:brain?text(brain,'long_text_mm8xeb55'):text(row,config.action),owner:brain?text(brain,'text_mm8xen8a'):text(row,config.owner),due:brain?date(brain,'date_mm8xx6fr'):date(row,config.due),
        createdAt:row.created_at,updatedAt:row.updated_at, responses:history, currentResponseId:response?.id||'',
        rootCause:[...new Set(issueHistory.map(i=>i.fault).filter(Boolean))].join(' / ')||'Unassigned',
        causeDetail:issueHistory.map(i=>i.scenario).filter(Boolean).join('\n'),
        outstanding:activeIssues.map(i=>i.scenario||i.outcome||'Incident details required').concat(a.exceptionDetails && !/^(none|n\/a|no issues)$/i.test(a.exceptionDetails)?[a.exceptionDetails]:[]).join('\n'),
        incidents:issueHistory, activeIssueCount:activeIssues.length,
        sources:{bau:rowUrl(config.id,row.id),brain:brain?rowUrl(BRAIN_ID,brain.id):'',response:response?.url||'',incidents:issueHistory.map(i=>i.url)},
        tracking:brain?text(brain,'long_text_mm7fzxz1'):'',sourceWarnings,sourceHealth:health
      });
    }
  }
  const manualRows=(raw.manualEvidence||[]).flatMap(row=>{try{const a=JSON.parse(text(row,sources.manualEvidence.columns['Evidence JSON']));return [{...a,ledgerUrl:rowUrl(sources.manualEvidence.id,row.id)}];}catch{return [];}});
  const oldForms=(sources.legacyForms||[]).flatMap(board=>(raw[board.key]||[]).map(row=>({id:String(row.id),boardId:board.id,markets:board.markets,store:text(row,'short_textjluohkcj'),createdAt:row.created_at,formDate:date(row,'dateil43at5z'),ped:text(row,'single_selectdfcews6'),powerData:text(row,'single_selectyvczs4q'),comments:text(row,'long_textre3ommqp'),url:rowUrl(board.id,row.id)})));
  oldForms.push(...manualRows.filter(a=>a.scope==='original-fze-response'&&a.form).map(a=>a.form));
  for(const site of sites)applyLegacyEvidence(site,manualRows,oldForms);
  return {sites,incidents,unlinkedIncidents:incidents.filter(i=>!i.bauItems.length),responsesCount:responses.length};
}
export async function loadTracker({token,fetchImpl=fetch}={}) {
  if (!token) throw Error('Monday connection is not configured');
  const options = {token,fetchImpl};
  const specs = [...Object.entries(sources.countries).map(([key,b])=>[key,b.id,fieldList(b)]),
    ['brain',BRAIN_ID,BRAIN_COLUMNS],['signup','5678025992',SIGNUP_COLUMNS],
    ['responses',sources.responses.id,Object.values(sources.responses.columns).filter(c=>c!=='name')],
    ['incidents',sources.incidents.id,Object.values(sources.incidents.columns)],['manualEvidence',sources.manualEvidence.id,Object.values(sources.manualEvidence.columns).filter(c=>c!=='name')],...sources.legacyForms.map(b=>[b.key,b.id,['short_textjluohkcj','dateil43at5z','single_selectdfcews6','single_selectyvczs4q','long_textre3ommqp']])];
  const results = await Promise.allSettled(specs.map(async ([key,id,columns])=>[key,await readBoard(id,columns,options)]));
  const raw = {}, health = {};
  results.forEach((result,i)=>{const key=specs[i][0];health[key]={ok:result.status==='fulfilled',at:new Date().toISOString()};if(result.status==='fulfilled')raw[key]=result.value[1];else health[key].message='Source unavailable. Refresh or open Monday to verify.';});
  if (Object.keys(sources.countries).every(k=>!health[k].ok)) throw Error('Country install boards could not be loaded');
  return {...joinTracker(raw,health),health,loadedAt:new Date().toISOString(),today:currentDate(),readinessBoardUrl:`https://vita-mojo-team.monday.com/boards/${sources.responses.id}`};
}
