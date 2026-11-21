// Isolate potentially expensive verification of a fetched page from the UI thread.
import {run} from './run.mjs';
type Input={html:string;css:string;vw:[number,number];accessibility:boolean};
globalThis.addEventListener('message',(event:MessageEvent<Input>)=>{
  try{globalThis.postMessage({result:run(event.data)});}
  catch(error){globalThis.postMessage({error:error instanceof Error?error.message:String(error)});}
});
