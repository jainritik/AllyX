const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('production checkout permits Razorpay risk script without allowing arbitrary scripts', async () => {
  const source = ts.transpileModule(fs.readFileSync('next.config.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, process: { env: { NODE_ENV: 'production' }, cwd: () => process.cwd() } };
  vm.runInNewContext(source, context);
  const routes = await context.exports.default.headers();
  const csp = routes[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  const scripts = csp.split('; ').find(d => d.startsWith('script-src ')).split(' ').slice(1);
  assert.ok(scripts.includes(new URL('https://cdn.razorpay.com/static/cx/razorpay-risk-detection/bundle.js').origin));
  assert.ok(scripts.includes('https://checkout.razorpay.com'));
  assert.ok(!scripts.includes('*'));
  assert.ok(!scripts.includes('https:'));
  assert.ok(!scripts.includes("'unsafe-eval'"));
});
