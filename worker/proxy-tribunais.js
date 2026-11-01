/* PAUTA CF — Intermediário (Cloudflare Worker) para a Pesquisa nacional de teses.
 *
 * O painel é um site estático (GitHub Pages). O navegador não consegue chamar
 * o DataJud diretamente porque a API do CNJ não envia cabeçalhos CORS. Este
 * Worker repassa só duas consultas, só para o endereço do painel:
 *
 *   GET  /djen/comunicacao?<parâmetros>   → https://comunicaapi.pje.jus.br/api/v1/comunicacao
 *   POST /datajud/<indice>/_search         → https://api-publica.datajud.cnj.jus.br/<indice>/_search
 *
 * Não guarda nada e não aceita outros destinos. A chave do DataJud é a chave
 * pública divulgada pelo CNJ; pode ser trocada pela variável DATAJUD_API_KEY.
 * O endereço autorizado vem de ORIGENS (separadas por vírgula).
 *
 * Publicação: Cloudflare → Workers & Pages → Create → Worker → colar este
 * arquivo → Deploy. Copie o endereço *.workers.dev para o campo "Intermediário"
 * da Pesquisa nacional (botão ⚙ na página Análise de teses).
 */

const CHAVE_PUBLICA = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const ORIGENS_PADRAO = 'https://rafaelfildis.github.io';

function cabecalhosCors(origem) {
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function resposta(corpo, status, origem, extra = {}) {
  return new Response(corpo, { status, headers: { ...cabecalhosCors(origem), ...extra } });
}

export default {
  async fetch(request, env) {
    const origensPermitidas = String(env.ORIGENS || ORIGENS_PADRAO).split(',').map((o) => o.trim()).filter(Boolean);
    const origem = request.headers.get('Origin') || '';
    const permitida = origensPermitidas.includes(origem) || origensPermitidas.includes('*');
    const origemResposta = permitida ? origem || origensPermitidas[0] : origensPermitidas[0];
    if (!permitida) return resposta('Origem não autorizada.', 403, origemResposta);
    if (request.method === 'OPTIONS') return resposta(null, 204, origemResposta);

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/djen/comunicacao') {
      const destino = new URL('https://comunicaapi.pje.jus.br/api/v1/comunicacao');
      for (const [k, v] of url.searchParams) destino.searchParams.append(k, v);
      const r = await fetch(destino, { headers: { Accept: 'application/json' } });
      return resposta(r.body, r.status, origemResposta, { 'Content-Type': r.headers.get('Content-Type') || 'application/json' });
    }

    const dj = url.pathname.match(/^\/datajud\/(api_publica_[a-z0-9]+)\/_search$/);
    if (request.method === 'POST' && dj) {
      const corpo = await request.text();
      if (corpo.length > 20000) return resposta('Consulta grande demais.', 413, origemResposta);
      const r = await fetch(`https://api-publica.datajud.cnj.jus.br/${dj[1]}/_search`, {
        method: 'POST',
        headers: { Authorization: `APIKey ${env.DATAJUD_API_KEY || CHAVE_PUBLICA}`, 'Content-Type': 'application/json' },
        body: corpo,
      });
      return resposta(r.body, r.status, origemResposta, { 'Content-Type': 'application/json' });
    }

    return resposta('Rota não encontrada.', 404, origemResposta);
  },
};
