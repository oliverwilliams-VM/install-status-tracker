import test from 'node:test';import assert from 'node:assert/strict';import {installReadiness} from '../server/install-readiness.js';
const base={date:'2026-11-12',sourcesHealthy:true,gate:'Ready to Proceed',blockReason:'Ready to Proceed',siteStatus:'On Track'};
test('existing BAU ready decision survives an empty replacement form board',()=>{assert.equal(installReadiness(base).ready,true)});
test('On Track alone is not a VM readiness declaration',()=>{assert.equal(installReadiness({...base,gate:''}).ready,false)});
test('new Brian declaration must match the current install date',()=>{assert.equal(installReadiness({...base,decision:'Ready to install',decisionDate:'2026-11-11'}).ready,false);assert.equal(installReadiness({...base,decision:'Ready to install',decisionDate:base.date}).ready,true)});
test('explicit issues and conflicting sources override a ready declaration',()=>{for(const extra of [{activeIssues:1},{explicitOutstanding:true},{conflictingDate:true},{sourcesHealthy:false},{siteStatus:'RISKS'}])assert.equal(installReadiness({...base,...extra}).ready,false)});
test('a manual not-ready decision overrides the legacy ready flag',()=>{assert.equal(installReadiness({...base,decision:'Not ready',decisionDate:base.date}).ready,false)});
