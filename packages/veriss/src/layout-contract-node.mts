import type {ObligationIR,ContractProof} from './layout-contract.mjs';
import type {RelationalObligationIR,RelationalProof,Observation} from './relational-contract.mjs';
import type {LayoutSummary} from './layout-contracts.d.ts';
type Options={timeoutMs?:number;observations?:readonly Observation[]};
import {verifyObligationIR,createLayoutIR,createDeclaredObligations} from './layout-contract.mjs';

/** Build-only convenience; browser Workers supply their own Z3 API instead. */
export function verifyContractObligation(obligation:ObligationIR,options?:{timeoutMs?:number}):Promise<ContractProof>;
export function verifyContractObligation(obligation:RelationalObligationIR,options?:{observations?:readonly Observation[]}):Promise<RelationalProof>;
export async function verifyContractObligation(obligation:ObligationIR|RelationalObligationIR,options?:Options):Promise<ContractProof|RelationalProof> {
  if(obligation?.operation==='relational')return verifyObligationIR(obligation,undefined,options);
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyObligationIR(obligation,api,options);}
  finally {await killThreads(api.em);}
}

export async function verifyDeclaredLayouts(report:LayoutSummary,options?:{timeoutMs?:number}):Promise<ContractProof[]> {
  const obligations=createDeclaredObligations(createLayoutIR(report));
  if(!obligations.length) return [];
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {
    const results=[];
    for(const obligation of obligations) results.push(await verifyObligationIR(obligation,api,options));
    return results;
  } finally {await killThreads(api.em);}
}
