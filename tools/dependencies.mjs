import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);

// Prefer dependencies installed in the checkout. The existing desktop runtime
// is an optional fallback, so building this repository does not require Codex.
export function dependency(name){
  const candidates=[name];
  if(process.env.CODEX_NODE_MODULES)candidates.push(path.join(process.env.CODEX_NODE_MODULES,name));
  candidates.push(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',name));
  for(const candidate of candidates){
    let resolved;
    try{resolved=require.resolve(candidate);}catch(error){if(error.code==='MODULE_NOT_FOUND')continue;throw error;}
    return require(resolved);
  }
  throw new Error(`Missing development dependency ${name}. Run npm install in the repository root.`);
}

export function browserOptions(){
  if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)return {headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH};
  if(process.platform==='win32'){
    const edge=path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe');
    if(fs.existsSync(edge))return {headless:true,executablePath:edge};
  }
  return {headless:true};
}
