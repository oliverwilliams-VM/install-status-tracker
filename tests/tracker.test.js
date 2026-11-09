import test from 'node:test';
import assert from 'node:assert/strict';
import {joinTracker,faultGroup} from '../server/readiness-tracker.js';
import sources from '../server/tracker-sources.json' with {type:'json'};
const cell=(id,text,value=null,linked_item_ids=[])=>({id,text,value:JSON.stringify(value),linked_item_ids});
const c=sources.countries.UK, rc=sources.responses.columns;
const site={id:'test-job',name:'99999',column_values:[cell(c.date,'',{date:'2026-11-16'}),cell(c.format,'SFK'),cell(c.phase,'Installed'),cell(c.signup,'',null,['signup'])]};
const response=(date)=>({id:'response',name:'99999',column_values:[...Object.entries({'Market':'UK','Store Number':'99999','BAU Board ID':c.id,'BAU Item ID':'test-job','Submitted At UTC':'2026-11-08T12:00:00Z','PEDs Received':'Yes','Power Completed':'Yes','Data Completed':'No'}).map(([k,v])=>cell(rc[k],v)),cell(rc['Install Date'],'',{date})]});
test('stale responses stay in history and cannot qualify rescheduled work',()=>{const result=joinTracker({UK:[site],responses:[response('2026-11-09')]});assert.equal(result.sites[0].received,'Unknown');assert.equal(result.sites[0].responses.length,1);});
test('current response keeps power and data separate',()=>{const result=joinTracker({UK:[site],responses:[response('2026-11-16')]});assert.equal(result.sites[0].power,'Yes');assert.equal(result.sites[0].data,'No');});
test('ambiguous Brian links never supply a signed or ordered milestone',()=>{const brain=id=>({id,column_values:[cell('board_relation_mm7s293s','',null,['signup']),cell('boolean_mm8qvyqt','',{checked:true})]});const result=joinTracker({UK:[site],brain:[brain('one'),brain('two')]});assert.equal(result.sites[0].signed,'Unknown');assert.equal(result.sites[0].sourceWarnings.length,1);});
test('incident reporting collapses VM suppliers while preserving the three owners',()=>{for(const fault of ['Vita Mojo','Apex','Supplier','Supplier / Apex','P&D contractor'])assert.equal(faultGroup(fault),'VM');assert.equal(faultGroup('Store'),'FZE');assert.equal(faultGroup('Subway'),'Subway');assert.equal(faultGroup(''),'Unassigned');});

test('an upcoming install needs PED receipt evidence even with a Brain or legacy BAU go decision',()=>{
 const job={...site,column_values:site.column_values.filter(column=>column.id!==c.phase).concat(cell(c.readinessGate,'Ready to Proceed'))};
 const brain={id:'brain-job',column_values:[
  cell('board_relation_mm7s293s','',null,['signup']),
  cell('color_mm8x8cxv','Ready to install'),
  cell('date_mm8x4m1e','',{date:'2026-11-16'}),
  cell('boolean_mm8qa0fn','',{checked:true}),
 ]};
 for(const brainRows of [[],[brain]]){
  const raw={UK:[job],brain:brainRows};
  const unknown=joinTracker(raw).sites[0];
  assert.equal(unknown.readiness.ready,false);
  assert.equal(unknown.readiness.reason,'Confirm PED receipt for this installation');
  const delivered={...job,column_values:[...job.column_values,cell(c.pedStatus,'PEDs delivered')]};
  assert.equal(joinTracker({...raw,UK:[delivered]}).sites[0].readiness.ready,true);
 }
 assert.equal(joinTracker({UK:[site]}).sites[0].readiness.label,'Complete');
});
