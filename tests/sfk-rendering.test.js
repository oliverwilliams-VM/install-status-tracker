import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {copyFor} from '../src/readiness/copy.js';
const bundled=await build({entryPoints:['src/readiness/ExpandedQuestions.jsx'],bundle:true,platform:'node',format:'cjs',external:['react'],write:false});
const module={exports:{}};
vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
const Questions=module.exports.default;
for(const country of ['UK','IE','NL','DE'])for(const projectType of ['new','remodel','trading']){
 test(`SFK table questions render for ${country} ${projectType}, with required order/date/ETA`,()=>{
  const copy=copyFor(country);
  const props={section:'tableOnly',c:copy,answers:{table:'yes',tableOrderDate:'2026-10-01',tableInStore:'no',tableDeliveryStatus:'eta',tableDelivery:'2026-11-01'},setAnswers(){},binding:{country,projectType,installType:'sfk'}};
  const html=renderToStaticMarkup(React.createElement(Questions,props));
  assert.ok(html.includes(copy.tableSection));assert.match(html,/name="table"/);assert.match(html,/name="tableInStore"/);assert.ok(html.includes(copy.tableOrderDate));assert.ok(html.includes(copy.tableDeliveryStatus));assert.match(html,/<select required/);assert.match(html,/type="date" required/);
  const initial=renderToStaticMarkup(React.createElement(Questions,{...props,answers:{}}));
  assert.ok(initial.includes(copy.tableOrderDate));assert.match(initial,/type="date" required/);
  const notOrdered=renderToStaticMarkup(React.createElement(Questions,{...props,answers:{table:'no'}}));
  assert.ok(!notOrdered.includes(copy.tableOrderDate));
  const nonSfk=renderToStaticMarkup(React.createElement(Questions,{...props,binding:{...props.binding,installType:'other'}}));
  assert.ok(!nonSfk.includes('name="table"'));assert.ok(!nonSfk.includes(copy.tableSection));
 });
}
