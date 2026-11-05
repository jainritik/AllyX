const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function setup(status = 200) {
    const captions = [], errors = [], sent = [];
    const state = {};
    class Socket {
        static OPEN = 1;
        constructor(url, protocols) { Object.assign(state, { ws: this }); this.readyState = 0; this.bufferedAmount = 0; this.protocols = protocols; }
        send(data) { sent.push(data); }
        close() { this.readyState = 3; }
        open() { this.readyState = 1; this.onopen(); }
        result(text, final, start = 0) { this.onmessage({ data: JSON.stringify({type:'Results',start,duration:1,is_final:final,channel:{alternatives:[{transcript:text}]}}) }); }
    }
    class Recorder {
        static isTypeSupported() { return true; }
        constructor() { Object.assign(state, { recorder: this }); this.state = 'inactive'; }
        start(interval) { this.interval = interval; this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.ondataavailable?.({data:{size:5,finalAudio:true}}); this.onstop?.(); }
    }
    const context = { exports: {}, URLSearchParams, AbortSignal, WebSocket:Socket, MediaRecorder:Recorder, setTimeout, clearTimeout,
        fetch: async () => ({status,ok:status===200,json:async()=>({token:'temporary-test-token'})}) };
    const source = fs.readFileSync(path.join(__dirname,'../src/lib/deepgram-stream.ts'),'utf8');
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
    const controller = new AbortController();
    return { captions, errors, sent, controller, get ws(){return state.ws;}, get recorder(){return state.recorder;},
      start:()=>context.exports.startDeepgramStream({stream:{},sessionId:'session',language:'en-US',signal:controller.signal,onCaption:(...x)=>captions.push(x),onError:x=>errors.push(x)}) };
}
async function connect(s) { const p=s.start(); await new Promise(setImmediate); s.ws.open(); return p; }
test('disabled trial returns to existing transcription without opening a socket',async()=>{
 const s=setup(204); assert.equal(await s.start(),null); assert.equal(s.ws,undefined);
});
test('streams partial revisions and commits each final only once',async()=>{
 const s=setup();const live=await connect(s);
 try { assert.equal(s.recorder.interval,100);assert.deepEqual(Array.from(s.ws.protocols),['bearer','temporary-test-token']);
 s.ws.result('hello',false);s.ws.result('hello world',false);s.ws.result('Hello world.',true);s.ws.result('Hello world.',true);
 assert.deepEqual(s.captions,[['hello',false],['hello world',false],['Hello world.',true]]);
 } finally {live.stop();}
});
test('Stop sends last audio before CloseStream and waits for provider completion',async()=>{
 const s=setup();const live=await connect(s);const finished=live.finish();
 assert.equal(s.sent[0].finalAudio,true);assert.equal(JSON.parse(s.sent[1]).type,'CloseStream');
 s.ws.result('Final words.',true);
 s.ws.onmessage({data:JSON.stringify({type:'Metadata'})});s.ws.onclose({code:1000});await finished;
 assert.deepEqual(s.captions,[['Final words.',true]]);
});
test('disconnect during finalization rejects rather than using an incomplete question',async()=>{
 const s=setup();const live=await connect(s);const done=live.finish();s.ws.onclose({code:1006});
 await assert.rejects(done);assert.equal(s.errors.length,1);assert.equal(s.recorder.state,'inactive');
});
test('abort stops recording and discards late provider results',async()=>{
 const s=setup();await connect(s);s.controller.abort();s.ws.result('stale',true);
 assert.equal(s.recorder.state,'inactive');assert.equal(s.captions.length,0);
});
test('backpressure closes capture instead of accumulating delayed captions',async()=>{
 const s=setup();await connect(s);s.ws.bufferedAmount=1000001;s.recorder.ondataavailable({data:{size:4}});
 assert.equal(s.errors.length,1);assert.equal(s.recorder.state,'inactive');
});
