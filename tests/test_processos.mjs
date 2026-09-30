/* Testes do classificador do Painel de Processos: node --test tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classificarResultado, lerCnj } from '../assets/js/processos/classificar.js';
import { classificarMovimento, consolidarProcesso, resultadoDoHistorico } from '../assets/js/processos/movimentos.js';

const res = (texto, papel = 'Autor', etiquetas = '') => classificarResultado({
  'Descrição do último histórico': texto, 'Papel do cliente': papel, Etiquetas: etiquetas,
});

test('liminar: indeferimento não é lido como deferimento', () => {
  assert.equal(res('INDEFIRO a tutela de urgência requerida').liminar, 'indeferida');
  assert.equal(res('Não concedida a liminar').liminar, 'indeferida');
  assert.equal(res('Defiro a tutela de urgência').liminar, 'deferida');
});

test('sentença: procedência com dano moral negado é parcial', () => {
  assert.equal(res('JULGO PROCEDENTES os pedidos para declarar a inexistência do débito e JULGO IMPROCEDENTE o pedido de indenização por danos morais').resultado, 'parcial');
  assert.equal(res('julgo procedentes, em parte, os pedidos').resultado, 'parcial');
  assert.equal(res('julgo procedente o pedido e improcedentes os pedidos contrapostos').resultado, 'procedente');
});

test('acórdão: a sentença de origem prevalece sobre o dispositivo do recurso', () => {
  const r = res('RECURSO INOMINADO. SENTENÇA DE PROCEDÊNCIA. RECURSO DO RÉU. Recurso conhecido e provido. Sentença reformada para julgar improcedentes os pedidos iniciais.');
  assert.equal(r.resultado, 'improcedente');
});

test('acordo e extinções', () => {
  assert.equal(res('HOMOLOGO, por sentença, para que produza seus jurídicos e legais efeitos, o acordo celebrado e julgo extinto o processo com resolução do mérito').resultado, 'acordo');
  assert.equal(res('Homologado o acordo.').resultado, 'acordo');
  assert.equal(res('JULGO EXTINTA A EXECUÇÃO, nos termos do art. 924, II').resultado, 'procedente');
  assert.equal(res('JULGO EXTINTO O PROCESSO SEM RESOLUÇÃO DO MÉRITO').resultado, 'sem_merito');
  assert.equal(res('Processo desarquivado').situacao, 'em_andamento');
});

test('cliente réu inverte o resultado', () => {
  assert.equal(res('Julgada procedente a ação', 'Reclamada').resultado, 'improcedente');
});

test('número CNJ com e sem máscara', () => {
  assert.equal(lerCnj('80013533220268050124').formatado, '8001353-32.2026.8.05.0124');
  assert.equal(lerCnj('8001353-32.2026.8.05.0124').origem, '8.05.0124');
});

test('DataJud: códigos TPU de sentença, recurso e liminar', () => {
  assert.deepEqual(classificarMovimento({ codigo: 221 }), { tipo: 'sentenca', valor: 'parcial' });
  assert.deepEqual(classificarMovimento({ codigo: 792 }), { tipo: 'liminar', valor: 'indeferida' });
  assert.deepEqual(classificarMovimento({ codigo: 339 }), { tipo: 'liminar', valor: 'deferida' });
  assert.equal(classificarMovimento({ codigo: 51 }), null);
});

test('DataJud: improcedência revertida em recurso do autor vira procedência', () => {
  const c = consolidarProcesso([
    { grau: 'JE', movimentos: [{ codigo: 220, dataHora: '2026-03-01T00:00:00' }] },
    { grau: 'TR', movimentos: [{ codigo: 237, dataHora: '2026-06-01T00:00:00' }] },
  ]);
  assert.equal(resultadoDoHistorico(c), 'procedente');
  assert.equal(resultadoDoHistorico(c, true), 'improcedente');
});
