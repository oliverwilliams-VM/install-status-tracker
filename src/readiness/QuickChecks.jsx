import React from 'react';
import { ReadinessQuestion } from './ExpandedQuestions';
import { quickGroups, quickDetailFields } from './model.js';
export default function QuickChecks({answers:a,setAnswers,c,binding}) {
 return <section className="rd-question-section rd-quick-checks"><h2>{c.quickChecksTitle}</h2><p className="rd-caption">{c.quickChecksHelp}</p>{quickGroups(binding.projectType).map(group=><div key={group.key}>
 <ReadinessQuestion field={group.key} c={c} answers={a.quickConfirmations || {}} setAnswers={updater=>setAnswers(old=>{const next=updater(old.quickConfirmations||{});const value=next[group.key];return {...old,quickConfirmations:next,...(value==='yes'?Object.fromEntries(group.fields.map(k=>[k,'yes'])):{})};})}/>
 {a.quickConfirmations?.[group.key]&&a.quickConfirmations[group.key]!=='yes'&&<div className="rd-quick-details">{quickDetailFields(group,a).map(field=><ReadinessQuestion key={field} field={field} c={c} answers={a} setAnswers={setAnswers}/>)}{group.key==='siteReady'&&binding.projectType!=='trading'&&a.worksComplete!=='yes'&&<><ReadinessQuestion field="worksCompletionKnown" c={c} answers={a} setAnswers={setAnswers}/>{a.worksCompletionKnown==='yes'&&<label>{c.worksCompletionDate}<input required type="date" value={a.worksCompletionDate || ''} onChange={e=>setAnswers(old=>({...old,worksCompletionDate:e.target.value}))}/></label>}</>}</div>}
 </div>)}</section>;
}
