// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import {createLayoutModel,verifyLayoutModel} from './layout-z3.mjs';
import type {LayoutSummary} from './layout-contracts.d.ts';
import type {LayoutProof} from './layout-z3.mjs';

/** Ephemeral solver owns and tears down its Wasm threads, including failures. */
export async function verifyLayoutReport(report:LayoutSummary,options?:{timeoutMs?:number}):Promise<LayoutProof> {
  const {init,killThreads}=await import('z3-solver');
  const api=await init();
  try {return await verifyLayoutModel(createLayoutModel(report),api,options);}
  finally {await killThreads(api.em);}
}
