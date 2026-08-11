/* PAUTA CF — Tela de login.
 *
 * Camada de interface, não de segurança: o painel é um site estático, sem
 * servidor e sem back-end de autenticação. A credencial fica no código-fonte
 * e a "sessão" é apenas uma marca no sessionStorage do navegador — suficiente
 * para impedir o acesso casual à tela, mas visível a quem inspecionar o site.
 * Não usar para proteger dados verdadeiramente sensíveis.
 */

const CHAVE_SESSAO = 'pautacf.sessao.v1';

const CREDENCIAL = {
  login: 'calmonefreitas.adv@gmail.com',
  senha: 'cf123',
};

const $ = (sel) => document.querySelector(sel);

function sessaoValida() {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO) === '1';
  } catch {
    return false;
  }
}

function abrirApp() {
  document.documentElement.classList.add('autenticado');
}

function fecharApp() {
  document.documentElement.classList.remove('autenticado');
}

function marcarSessao() {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, '1');
  } catch {
    /* sessionStorage indisponível — a sessão simplesmente não persiste. */
  }
  abrirApp();
}

function encerrarSessao() {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch { /* nada a fazer */ }
  fecharApp();

  // Recarrega para restabelecer o estado inicial da tela e limpar campos em memória.
  location.reload();
}

function normalizar(texto) {
  return texto.trim().toLowerCase();
}

function ligar() {
  const form = $('#formLogin');
  const campoLogin = $('#loginUsuario');
  const campoSenha = $('#loginSenha');
  const erro = $('#loginErro');
  const btnSair = $('#btnSair');
  const btnVerSenha = $('#btnVerSenha');

  if (sessaoValida()) abrirApp();

  btnVerSenha?.addEventListener('click', () => {
    const visivel = campoSenha.type === 'text';
    campoSenha.type = visivel ? 'password' : 'text';
    btnVerSenha.setAttribute('aria-pressed', String(!visivel));
    btnVerSenha.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
  });

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();

    const loginOk = normalizar(campoLogin.value) === normalizar(CREDENCIAL.login);
    const senhaOk = campoSenha.value === CREDENCIAL.senha;

    if (loginOk && senhaOk) {
      erro.hidden = true;
      campoSenha.value = '';
      marcarSessao();
    } else {
      erro.hidden = false;
      campoSenha.value = '';
      campoSenha.focus();
    }
  });

  btnSair?.addEventListener('click', encerrarSessao);
}

document.addEventListener('DOMContentLoaded', ligar);
