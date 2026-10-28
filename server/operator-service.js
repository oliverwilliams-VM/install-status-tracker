// Called by the existing reviewed Brain workflow, never by a recipient/browser route.
import {issueToken,hash} from './token.js';
import {rpc} from './coordinator.js';
import {validateBinding,plusDays} from '../src/readiness/model.js';
export async function prepareInvitation({binding,brainItemId,fzeEmail,mfpEmail,sourceReference,revision=1}, {env=process.env,call=rpc,now=Date.now}={}){
 validateBinding(binding);
 if(!/^\d+$/.test(String(brainItemId||'')))throw Error('Exact Brain item required');
 const origin=new URL(env.READINESS_PORTAL_ORIGIN);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Approved portal origin required');
 const expires=Date.parse(plusDays(binding.installDate,2)+'T23:59:59Z');if(expires<=now())throw Error('Installation link would already be expired');
 const token=issueToken({id:binding.id,revision,expires},env.READINESS_LINK_SECRET);
 const command={operation:revision===1?'issue':'rebindContext',id:binding.id,binding,installDate:binding.installDate,installItemId:binding.itemId,country:binding.country,brainItemId:String(brainItemId),fzeEmail,mfpEmail,sourceReference,tokenHash:hash(token),expires};
 // Coordinator independently resolves the current Brain relationship/date/recipients.
 const result=await call(command,{env});
 if(result.revision!==revision)throw Error('Invitation revision must be reconciled');
 return {id:binding.id,revision,url:origin.origin+'/?view=readiness#access='+token,expires};
}
