/* PAUTA CF — Selo de dano moral: ✓ verde quando houve, ✕ vermelho quando não
 * houve, ? cinza quando não foi possível identificar. O texto acompanha o
 * ícone, para que a informação não dependa só da cor. */

const ICONE = { sim: '✓', nao: '✕', indef: '?' };

export function seloDano(estado, texto, titulo) {
  const s = document.createElement('span');
  s.className = `selo-dano-moral selo-dano-moral--${estado}`;
  if (titulo) s.title = titulo;
  const i = document.createElement('span');
  i.className = 'selo-dano-moral__icone';
  i.setAttribute('aria-hidden', 'true');
  i.textContent = ICONE[estado];
  s.append(i);
  if (texto) s.append(document.createTextNode(texto));
  return s;
}

/** Selo para contagens (tabelas por vara/comarca): ✓ Sim (com a quantidade, se mais de uma) ou ✕ Não. */
export function seloContagem(n) {
  return n > 0
    ? seloDano('sim', n === 1 ? 'Sim' : `Sim (${n})`, `${n} sentença${n === 1 ? '' : 's'} com dano moral`)
    : seloDano('nao', 'Não', 'Nenhuma sentença com dano moral');
}
