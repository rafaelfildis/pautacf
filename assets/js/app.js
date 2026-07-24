/* PAUTA DE AUDIÊNCIAS CALMON E FREITAS ADVOGADOS — controlador da interface. */

import { parseICS } from './ics.js';
import {
  getAnotacao, setAnotacao, exportarAnotacoes, importarAnotacoes,
  getAdvogados, setAdvogados, getConfig, setConfig, salvarCache, lerCache,
} from './store.js';
import { MARCA, MODALIDADES, gerarNomeArquivo } from './formato.js';
import { ligarExportacao } from './exportar.js';
import { carregarLogoDataURI } from './doc-html.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* A grande maioria das audiências do escritório é telepresencial, e o feed do
   Astrea não exporta a modalidade — então "Virtual" já vem marcado e o usuário
   só troca as exceções. */
const MODALIDADE_PADRAO = 'Virtual';

const estado = {
  eventos: [],
  periodo: 'semana',
  referencia: new Date(),
  de: null,
  ate: null,
  busca: '',
  tipo: 'audiencia',
  responsavel: '',
  modalidade: '',
  ordem: { campo: 'inicio', asc: true },
};

/* ================= datas ================= */

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const fmtMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });
const fmtCompleto = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
});
const fmtCarimbo = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fimDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Semana forense: segunda a domingo. */
function inicioDaSemana(d) {
  const base = inicioDoDia(d);
  const deslocamento = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - deslocamento);
  return base;
}

function somarDias(d, n) {
  const nova = new Date(d);
  nova.setDate(nova.getDate() + n);
  return nova;
}

/** Intervalo [inicio, fim] correspondente ao filtro de período ativo. */
function intervaloAtual() {
  const ref = estado.referencia;

  switch (estado.periodo) {
    case 'dia':
      return { inicio: inicioDoDia(ref), fim: fimDoDia(ref) };

    case 'semana': {
      const inicio = inicioDaSemana(ref);
      return { inicio, fim: fimDoDia(somarDias(inicio, 6)) };
    }

    case 'mes': {
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return { inicio, fim: fimDoDia(fim) };
    }

    default: {
      const inicio = estado.de ? inicioDoDia(estado.de) : inicioDoDia(ref);
      const fim = estado.ate ? fimDoDia(estado.ate) : fimDoDia(somarDias(inicio, 30));
      return { inicio, fim };
    }
  }
}

function rotuloPeriodo() {
  const { inicio, fim } = intervaloAtual();

  switch (estado.periodo) {
    case 'dia':
      return fmtCompleto.format(inicio);
    case 'semana':
      return `${fmtDiaMes.format(inicio)} a ${fmtDiaMes.format(fim)} de ${fim.getFullYear()}`;
    case 'mes':
      return fmtMesAno.format(inicio);
    default:
      return `${fmtData.format(inicio)} a ${fmtData.format(fim)}`;
  }
}

/* ================= dados ================= */

/** Aplica anotações locais e normaliza os campos para exibição. */
function decorar(evento) {
  const anotacao = getAnotacao(evento.uid);

  return {
    ...evento,
    responsavel: anotacao.responsavel || '',
    modalidade: anotacao.modalidade || MODALIDADE_PADRAO,
    cidade: anotacao.cidade ?? evento.cidade,
    link: anotacao.link ?? evento.link,
  };
}

function filtrar() {
  const { inicio, fim } = intervaloAtual();
  const busca = estado.busca.trim().toLowerCase();

  let lista = estado.eventos
    .filter((e) => e.inicio >= inicio && e.inicio <= fim)
    .map(decorar);

  if (estado.tipo !== 'todos') {
    const aceitos = estado.tipo.split('+');
    lista = lista.filter((e) => aceitos.includes(e.subtipo));
  }
  if (estado.responsavel) {
    lista = lista.filter((e) =>
      estado.responsavel === '__sem__' ? !e.responsavel : e.responsavel === estado.responsavel
    );
  }
  if (estado.modalidade) lista = lista.filter((e) => e.modalidade === estado.modalidade);

  if (busca) {
    lista = lista.filter((e) =>
      [e.parteAutora, e.parteRe, e.processo, e.foro, e.cidade, e.titulo, e.responsavel]
        .join(' ')
        .toLowerCase()
        .includes(busca)
    );
  }

  const { campo, asc } = estado.ordem;
  lista.sort((a, b) => {
    const va = campo === 'inicio' || campo === 'hora' ? a.inicio : String(a[campo] || '');
    const vb = campo === 'inicio' || campo === 'hora' ? b.inicio : String(b[campo] || '');
    const cmp = va instanceof Date ? va - vb : va.localeCompare(vb, 'pt-BR');
    return asc ? cmp : -cmp;
  });

  return lista;
}

/** Contagem exibida na barra de exportação da tela. */
function resumoDaTela(lista) {
  const conta = (sub) => lista.filter((e) => e.subtipo === sub).length;
  const audiencias = conta('audiencia');
  const tarefas = conta('tarefa');
  const prazos = conta('prazo');

  const partes = [];
  if (audiencias) partes.push(`${audiencias} audiência${audiencias > 1 ? 's' : ''}`);
  if (tarefas) partes.push(`${tarefas} tarefa${tarefas > 1 ? 's' : ''}`);
  if (prazos) partes.push(`${prazos} prazo${prazos > 1 ? 's' : ''}`);

  const rotuloTipo = { dia: 'Pauta do dia', semana: 'Pauta da semana', mes: 'Pauta do mês' };

  return {
    titulo: rotuloTipo[estado.periodo] || 'Pauta do período',
    subtitulo: rotuloPeriodo(),
    contagem: partes.join(' · ') || 'Sem compromissos',
  };
}

/**
 * Entrega aos módulos de exportação exatamente o que está na tela: os mesmos
 * registros filtrados, na mesma ordem, e o período correspondente.
 */
function obterDadosParaExportacao() {
  const { inicio, fim } = intervaloAtual();
  return {
    registros: filtrar(),
    periodo: { de: inicio, ate: fim, rotulo: rotuloPeriodo() },
  };
}

function baixarTexto(texto, nome) {
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ================= renderização ================= */

function renderizar() {
  const lista = filtrar();
  const corpo = $('#corpoTabela');
  const advogados = getAdvogados();
  const hoje = fmtData.format(new Date());

  corpo.replaceChildren();

  for (const item of lista) {
    const tr = document.createElement('tr');
    tr.dataset.uid = item.uid;
    if (item.tipo === 'tarefa') tr.classList.add('linha--tarefa');
    if (!item.responsavel) tr.classList.add('linha--sem-resp');
    if (fmtData.format(item.inicio) === hoje) tr.classList.add('linha--hoje');

    // Data
    const tdData = document.createElement('td');
    tdData.className = 'col-data';
    tdData.textContent = fmtData.format(item.inicio);
    const semana = document.createElement('span');
    semana.className = 'dia-semana';
    semana.textContent = fmtDiaSemana.format(item.inicio).replace('-feira', '');
    tdData.appendChild(semana);
    tr.appendChild(tdData);

    // Horário ou selo de tarefa
    const tdHora = document.createElement('td');
    tdHora.className = 'col-hora';
    if (item.tipo === 'tarefa') {
      const selo = document.createElement('span');
      selo.className = `selo selo--${item.subtipo}`;
      selo.textContent = item.subtipo === 'prazo' ? 'Prazo' : 'Tarefa';
      tdHora.appendChild(selo);
      if (item.detalhe) {
        const t = document.createElement('span');
        t.className = 'dia-semana titulo-tarefa';
        t.textContent = item.detalhe;
        tdHora.appendChild(t);
      }
    } else {
      tdHora.textContent = `${fmtHora.format(item.inicio)}${item.fim ? ` – ${fmtHora.format(item.fim)}` : ''}`;
    }
    tr.appendChild(tdHora);

    for (const valor of [item.parteAutora || item.titulo, item.parteRe]) {
      const td = document.createElement('td');
      td.textContent = valor || '—';
      tr.appendChild(td);
    }

    const tdProc = document.createElement('td');
    tdProc.className = 'col-processo';
    tdProc.textContent = item.processo || '—';
    tr.appendChild(tdProc);

    const tdForo = document.createElement('td');
    tdForo.className = 'foro';
    tdForo.textContent = item.foro || '—';
    tr.appendChild(tdForo);

    // Cidade — editável, pois o foro do Astrea não é padronizado
    const tdCidade = document.createElement('td');
    tdCidade.className = 'col-cidade';
    tdCidade.contentEditable = 'true';
    tdCidade.spellcheck = false;
    tdCidade.textContent = item.cidade || '';
    tdCidade.addEventListener('blur', () => {
      setAnotacao(item.uid, { cidade: tdCidade.textContent.trim() });
      atualizarIndicadores();
    });
    tr.appendChild(tdCidade);

    tr.appendChild(celulaSelecao('col-resp', advogados, item.responsavel, 'Definir…', (valor) => {
      setAnotacao(item.uid, { responsavel: valor });
      renderizar();
    }));

    tr.appendChild(celulaSelecao('col-modo', MODALIDADES, item.modalidade, '—', (valor) => {
      setAnotacao(item.uid, { modalidade: valor });
      renderizar();
    }));

    tr.appendChild(celulaLink(item));

    corpo.appendChild(tr);
  }

  $('#vazio').hidden = lista.length > 0;
  $('#rotuloPeriodo').textContent = rotuloPeriodo();

  const meta = resumoDaTela(lista);
  $('#exportarTitulo').textContent = meta.titulo;
  $('#exportarSubtitulo').textContent = `${meta.subtitulo} · ${meta.contagem}`;

  atualizarIndicadores(lista);
}

/**
 * Célula do link da audiência: abre em nova aba quando preenchida e vira campo de
 * digitação ao receber foco, já que o feed só traz o link em parte dos casos.
 */
function celulaLink(item) {
  const td = document.createElement('td');
  td.className = 'col-link';

  const campo = document.createElement('input');
  campo.type = 'url';
  campo.className = 'celula celula--link';
  campo.value = item.link || '';
  campo.placeholder = 'colar link';
  campo.spellcheck = false;

  campo.addEventListener('change', () => {
    setAnotacao(item.uid, { link: campo.value.trim() });
    renderizar();
  });

  td.appendChild(campo);

  if (item.link) {
    const abrir = document.createElement('a');
    abrir.href = item.link;
    abrir.target = '_blank';
    abrir.rel = 'noopener noreferrer';
    abrir.className = 'abrir-link';
    abrir.textContent = '↗';
    abrir.title = 'Abrir sala da audiência';
    td.appendChild(abrir);
  }

  return td;
}

function celulaSelecao(classe, opcoes, valorAtual, rotuloVazio, aoMudar) {
  const td = document.createElement('td');
  td.className = classe;

  const select = document.createElement('select');
  select.className = 'celula';

  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = rotuloVazio;
  select.appendChild(vazio);

  for (const opcao of opcoes) {
    const o = document.createElement('option');
    o.value = opcao;
    o.textContent = opcao;
    select.appendChild(o);
  }

  select.value = valorAtual || '';
  select.addEventListener('change', () => aoMudar(select.value));

  td.appendChild(select);
  return td;
}

function atualizarIndicadores(lista = filtrar()) {
  const audiencias = lista.filter((e) => e.tipo === 'audiencia');
  const cidades = new Set(lista.map((e) => e.cidade).filter(Boolean));

  $('#kpiAudiencias').textContent = audiencias.length;
  $('#kpiTarefas').textContent = lista.length - audiencias.length;
  $('#kpiSemResponsavel').textContent = lista.filter((e) => !e.responsavel).length;
  $('#kpiComarcas').textContent = cidades.size;
}

/* ================= sincronização ================= */

function definirStatus(texto, classe) {
  $('#sincTexto').textContent = texto;
  $('#sincPonto').className = `sinc__ponto ${classe ? `sinc__ponto--${classe}` : ''}`;
}

function normalizarUrl(url) {
  return url.trim().replace(/^webcal:\/\//i, 'https://');
}

async function sincronizar({ silencioso = false } = {}) {
  const { urlAgenda } = getConfig();
  const botao = $('#btnSincronizar');

  botao.disabled = true;
  definirStatus('Sincronizando…', 'carregando');

  try {
    // O parâmetro evita respostas em cache do navegador e do CDN.
    const url = `${normalizarUrl(urlAgenda)}&timestamp=${Date.now()}`;
    const resposta = await fetch(url, { cache: 'no-store' });

    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const ics = await resposta.text();
    if (!ics.includes('BEGIN:VCALENDAR')) throw new Error('Resposta não é um calendário válido.');

    estado.eventos = parseICS(ics);
    salvarCache(ics);

    definirStatus(`Atualizado às ${fmtHora.format(new Date())} · ${estado.eventos.length} registros`, 'ok');
    if (!silencioso) avisar(`Agenda sincronizada: ${estado.eventos.length} compromissos.`);
  } catch (erro) {
    const cache = lerCache();

    if (cache) {
      estado.eventos = parseICS(cache.ics);
      definirStatus(`Offline · cópia de ${fmtCarimbo.format(new Date(cache.em))}`, 'erro');
      avisar('Não foi possível acessar o Astrea. Exibindo a última cópia salva.', true);
    } else {
      definirStatus('Falha na sincronização', 'erro');
      avisar(`Não foi possível carregar a agenda: ${erro.message}`, true);
    }
  } finally {
    botao.disabled = false;
    renderizar();
  }
}

/* ================= avisos ================= */

let timerAviso;

function avisar(mensagem, erro = false) {
  const el = $('#aviso');
  el.textContent = mensagem;
  el.className = `aviso ${erro ? 'aviso--erro' : ''}`;
  el.hidden = false;

  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, 4600);
}

/* ================= configurações ================= */

function renderizarAdvogados() {
  const container = $('#listaAdvogados');
  container.replaceChildren();

  for (const nome of getAdvogados()) {
    const etiqueta = document.createElement('span');
    etiqueta.className = 'etiqueta';
    etiqueta.textContent = nome;

    const remover = document.createElement('button');
    remover.type = 'button';
    remover.textContent = '×';
    remover.title = `Remover ${nome}`;
    remover.addEventListener('click', () => {
      setAdvogados(getAdvogados().filter((n) => n !== nome));
      renderizarAdvogados();
      preencherFiltroResponsavel();
      renderizar();
    });

    etiqueta.appendChild(remover);
    container.appendChild(etiqueta);
  }
}

function preencherFiltroResponsavel() {
  const select = $('#filtroResponsavel');
  const anterior = select.value;

  select.replaceChildren();

  const opcoes = [
    { valor: '', rotulo: 'Todos os responsáveis' },
    { valor: '__sem__', rotulo: 'Sem responsável' },
    ...getAdvogados().map((n) => ({ valor: n, rotulo: n })),
  ];

  for (const { valor, rotulo } of opcoes) {
    const o = document.createElement('option');
    o.value = valor;
    o.textContent = rotulo;
    select.appendChild(o);
  }

  select.value = opcoes.some((o) => o.valor === anterior) ? anterior : '';
  estado.responsavel = select.value;
}

/* ================= eventos da interface ================= */

function ligarEventos() {
  $$('.aba').forEach((aba) => {
    aba.addEventListener('click', () => {
      $$('.aba').forEach((a) => {
        a.classList.remove('aba--ativa');
        a.removeAttribute('aria-selected');
      });
      aba.classList.add('aba--ativa');
      aba.setAttribute('aria-selected', 'true');

      estado.periodo = aba.dataset.periodo;
      $('#filtrosLivre').hidden = estado.periodo !== 'livre';

      if (estado.periodo === 'livre' && !estado.de) {
        const { inicio, fim } = intervaloAtual();
        estado.de = inicio;
        estado.ate = fim;
        $('#dataDe').valueAsDate = inicio;
        $('#dataAte').valueAsDate = fim;
      }

      renderizar();
    });
  });

  const passo = (direcao) => {
    const ref = estado.referencia;
    if (estado.periodo === 'dia') estado.referencia = somarDias(ref, direcao);
    else if (estado.periodo === 'semana') estado.referencia = somarDias(ref, direcao * 7);
    else if (estado.periodo === 'mes') {
      estado.referencia = new Date(ref.getFullYear(), ref.getMonth() + direcao, 1);
    } else return;

    renderizar();
  };

  $('#btnAnterior').addEventListener('click', () => passo(-1));
  $('#btnProximo').addEventListener('click', () => passo(1));
  $('#btnHoje').addEventListener('click', () => {
    estado.referencia = new Date();
    renderizar();
  });

  $('#dataDe').addEventListener('change', (e) => {
    estado.de = e.target.valueAsDate;
    renderizar();
  });
  $('#dataAte').addEventListener('change', (e) => {
    estado.ate = e.target.valueAsDate;
    renderizar();
  });

  let timerBusca;
  $('#busca').addEventListener('input', (e) => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.busca = e.target.value;
      renderizar();
    }, 180);
  });

  $('#filtroTipo').addEventListener('change', (e) => { estado.tipo = e.target.value; renderizar(); });
  $('#filtroResponsavel').addEventListener('change', (e) => { estado.responsavel = e.target.value; renderizar(); });
  $('#filtroModalidade').addEventListener('change', (e) => { estado.modalidade = e.target.value; renderizar(); });

  $$('.tabela thead th[data-ordenar]').forEach((th) => {
    th.addEventListener('click', () => {
      const campo = th.dataset.ordenar;
      estado.ordem = {
        campo,
        asc: estado.ordem.campo === campo ? !estado.ordem.asc : true,
      };
      renderizar();
    });
  });

  $('#btnSincronizar').addEventListener('click', () => sincronizar());

  // Toda a exportação vive em exportar.js; a tela só entrega os dados filtrados.
  ligarExportacao({ obterDados: obterDadosParaExportacao, avisar });

  $('#fecharTexto').addEventListener('click', () => $('#modalTexto').close());
  $('#btnCopiarTexto').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#saidaTexto').value);
      avisar('Pauta copiada para a área de transferência.');
    } catch {
      $('#saidaTexto').select();
      avisar('Use Ctrl+C para copiar o texto selecionado.', true);
    }
  });
  $('#btnBaixarTexto').addEventListener('click', () => {
    const { periodo } = obterDadosParaExportacao();
    baixarTexto($('#saidaTexto').value, gerarNomeArquivo({
      de: periodo.de, ate: periodo.ate, extensao: 'txt',
    }));
  });

  // --- configurações ---
  $('#btnConfig').addEventListener('click', () => {
    $('#cfgUrl').value = getConfig().urlAgenda;
    renderizarAdvogados();
    $('#modalConfig').showModal();
  });

  $('#modalConfig').addEventListener('close', () => {
    const url = $('#cfgUrl').value.trim();
    if (url && url !== getConfig().urlAgenda) {
      setConfig({ urlAgenda: url });
      sincronizar();
    }
  });

  const adicionarAdvogado = () => {
    const campo = $('#novoAdvogado');
    const nome = campo.value.trim();
    if (!nome) return;

    setAdvogados([...getAdvogados(), nome]);
    campo.value = '';
    renderizarAdvogados();
    preencherFiltroResponsavel();
    renderizar();
  };

  $('#btnAddAdvogado').addEventListener('click', adicionarAdvogado);
  $('#novoAdvogado').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); adicionarAdvogado(); }
  });

  $('#btnExportarDados').addEventListener('click', () => {
    baixarTexto(exportarAnotacoes(), `pauta-cf-backup-${new Date().toISOString().slice(0, 10)}`);
    avisar('Backup salvo.');
  });

  $('#btnImportarDados').addEventListener('click', () => $('#arquivoImportar').click());
  $('#arquivoImportar').addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    try {
      const total = importarAnotacoes(await arquivo.text());
      renderizarAdvogados();
      preencherFiltroResponsavel();
      renderizar();
      avisar(`Backup restaurado: ${total} compromissos.`);
    } catch (erro) {
      avisar(`Falha ao restaurar: ${erro.message}`, true);
    } finally {
      e.target.value = '';
    }
  });
}

/* ================= início ================= */

function iniciar() {
  document.title = MARCA.titulo;
  ligarEventos();
  preencherFiltroResponsavel();
  carregarLogoDataURI();  // deixa a marca pronta antes da primeira exportação

  // Abre com a cópia local para a pauta aparecer instantaneamente.
  const cache = lerCache();
  if (cache) {
    estado.eventos = parseICS(cache.ics);
    renderizar();
  }

  sincronizar({ silencioso: !!cache });
}

iniciar();
