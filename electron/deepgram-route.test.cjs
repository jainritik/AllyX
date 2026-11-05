const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function setup({enabled='true', users='*', denied=false, providerOk=true}={}) {
 const calls=[];
 class Response {constructor(body,options){this.body=body;this.status=options.status;this.headers=options.headers;} static json(body,options){return new Response(body,{status:200,...options});}}
 const access={authorizeApi:async(_,kind)=>{calls.push(kind||'auth');return denied?{error:new Response(null,{status:401})}:{user:{id:'user'},reservationId:kind?'reservation':undefined};},commitApiQuota:async()=>calls.push('commit'),refundApiQuota:async()=>calls.push('refund')};
 const context={exports:{},process:{env:{DEEPGRAM_LIVE_ENABLED:enabled,DEEPGRAM_API_KEY:'server-key',DEEPGRAM_TRIAL_USER_IDS:users}},AbortSignal,
 require:name=>name==='next/server'?{NextResponse:Response}:access,
 fetch:async()=>{calls.push('provider');return {ok:providerOk,json:async()=>({access_token:'temporary-token'})};}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/app/api/transcribe/live/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
 return {calls,post:()=>context.exports.POST({})};
}
test('disabled and empty-allowlist trials never request a provider token',async()=>{for(const config of [{enabled:'false'},{users:''}]){const s=setup(config);assert.equal((await s.post()).status,204);assert.equal(s.calls.length,0);}});
test('unauthenticated users cannot obtain a token',async()=>{const s=setup({denied:true});assert.equal((await s.post()).status,401);assert.deepEqual(s.calls,['auth']);});
test('account allowlist excludes other users',async()=>{const s=setup({users:'another-user'});assert.equal((await s.post()).status,204);assert.deepEqual(s.calls,['auth']);});
test('all-user trial still checks entitlement and quota, returns only temporary token',async()=>{const s=setup();const r=await s.post();assert.equal(r.status,200);assert.equal(r.body.token,'temporary-token');assert.equal(r.headers['Cache-Control'],'no-store');assert.deepEqual(s.calls,['auth','transcribe','provider','commit']);assert.equal(JSON.stringify(r.body).includes('server-key'),false);});
test('provider failure refunds reserved quota',async()=>{const s=setup({providerOk:false});assert.equal((await s.post()).status,503);assert.deepEqual(s.calls,['auth','transcribe','provider','refund']);});
