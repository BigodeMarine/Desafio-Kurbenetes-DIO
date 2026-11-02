// Exercita o handler real sem dependências: duplicidade, confirmação e falhas.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(fetch) {
  let handler;
  const form = {
    reportValidity: () => true,
    addEventListener: (_, fn) => { handler = fn; },
    setAttribute() {}, removeAttribute() {},
    reset() { this.resets = (this.resets || 0) + 1; }
  };
  const button = {};
  const status = {};
  const values = {nome: 'Ana', email: 'ana@example.com', comentario: 'Olá'};
  vm.runInNewContext(fs.readFileSync('frontend/js.js', 'utf8'), {
    document: {querySelector: selector => ({'#contact': form, '#button-blue': button, '#status': status})[selector]},
    FormData: class { constructor() { return Object.entries(values); } },
    fetch, AbortSignal, TypeError, SyntaxError
  });
  return {form, button, status, values, submit: () => handler({preventDefault() {}})};
}
test('bloqueia envio simultâneo e só limpa após 201 confirmado', async () => {
  let finish, calls = 0;
  const ctx = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = ctx.submit();
  assert.equal(ctx.button.disabled, true);
  await ctx.submit();
  assert.equal(calls, 1);
  assert.equal(ctx.form.resets, undefined);
  finish({status: 201, json: async () => ({id: 1, message: 'Salvo'})});
  await pending;
  assert.equal(ctx.status.textContent, 'Salvo');
  assert.equal(ctx.form.resets, 1);
  assert.equal(ctx.button.disabled, false);
});
test('erro de validação mantém conteúdo para correção', async () => {
  const ctx = setup(async () => ({status: 422, json: async () => ({message: 'Revise', errors: {email: 'Email inválido'}})}));
  await ctx.submit();
  assert.match(ctx.status.textContent, /Email inválido/);
  assert.equal(ctx.form.resets, undefined);
});
test('resposta sem confirmação e falha de rede não informam sucesso', async () => {
  for (const fetch of [
    async () => ({status: 200, json: async () => ({})}),
    async () => { throw new TypeError('offline'); }
  ]) {
    const ctx = setup(fetch);
    await ctx.submit();
    assert.match(ctx.status.textContent, /Não foi possível/);
    assert.equal(ctx.form.resets, undefined);
    assert.equal(ctx.button.disabled, false);
  }
});
test('campos com espaços não geram requisição', async () => {
  const ctx = setup(() => { throw new Error('Não deve enviar'); });
  ctx.values.nome = '   ';
  await ctx.submit();
  assert.match(ctx.status.textContent, /Preencha/);
});
