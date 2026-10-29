const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/answer-continuation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const { buildAnswerContinuationMessages, shouldContinueAnswer, MAX_ANSWER_SEGMENTS } = exportsObject;

test('automatically continues output truncation, but not completed or blocked answers', () => {
    assert.equal(shouldContinueAnswer('length', 1), true);
    for (const reason of ['stop', 'content_filter', '']) assert.equal(shouldContinueAnswer(reason, 1), false);
    assert.equal(shouldContinueAnswer('length', MAX_ANSWER_SEGMENTS), false);
});

test('continuation preserves original question and exact partial code tail within API limits', () => {
    const question = 'Explain Two Sum';
    const answer = 'x'.repeat(18000) + '\n```cpp\nreturn {i,';
    const messages = buildAnswerContinuationMessages(question, answer);
    assert.equal(messages[0].content, question);
    assert.equal(messages[1].content, answer.slice(-12000));
    assert.ok(messages.every(message => message.content.length <= 12000));
    assert.ok(messages.reduce((total, message) => total + message.content.length, 12000) <= 40000);
    assert.match(messages[2].content, /Do not repeat prior text/);
});
