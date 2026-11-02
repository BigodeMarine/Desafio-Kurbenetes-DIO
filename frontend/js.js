'use strict';
const form = document.querySelector('#contact');
const button = document.querySelector('#button-blue');
const status = document.querySelector('#status');
let sending = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(data)) data[key] = data[key].trim();
  if (Object.values(data).some(value => !value)) {
    status.textContent = 'Preencha todos os campos, sem usar apenas espaços.';
    return;
  }
  sending = true;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Enviando…';
  try {
    const response = await fetch('/api/mensagens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (response.status !== 201 || !Number.isInteger(result.id) || result.id <= 0) {
      throw new Error(result.message ? [result.message, ...Object.values(result.errors || {})].join(' ') : 'Não foi possível salvar a mensagem.');
    }
    status.textContent = result.message;
    form.reset();
  } catch (error) {
    status.textContent = error.name === 'TimeoutError'
      ? 'Tempo de resposta excedido. O envio pode ter sido salvo; confirme antes de reenviar.'
      : error instanceof TypeError || error instanceof SyntaxError
        ? 'Não foi possível confirmar o envio. Verifique a conexão e tente novamente.'
        : error.message;
  } finally {
    sending = false;
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
