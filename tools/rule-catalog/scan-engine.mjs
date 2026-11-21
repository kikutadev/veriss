// Isolate potentially expensive verification of a fetched page from the UI thread.
import { run } from './run.mjs';
globalThis.addEventListener('message', (event) => {
    try {
        globalThis.postMessage({ result: run(event.data) });
    }
    catch (error) {
        globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
});
