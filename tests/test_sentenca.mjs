import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classificarSentenca, contemPalavras, pareceSentenca } from '../assets/js/teses/sentenca.js';

const r = (t) => classificarSentenca(t);

test('parcial com dano moral julgado improcedente (Juazeiro do Norte)', () => {
  const t = `Relatório dispensado. Requer indenização por danos morais no valor de R$ 10.000,00. Embora tenha sido reconhecida a inexigibilidade do débito, o pedido de indenização por danos morais deve ser julgado improcedente.
    Diante do exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos formulados na inicial (art. 487, I, do CPC) para: a) DECLARAR a inexistência do débito sob a rubrica "tarifa de comunicação digital", sob pena de multa diária de R$ 300,00 (trezentos reais) até o limite de R$ 3.000,00; b) CONDENAR a parte requerida BANCO AGIBANK S.A a título de danos materiais, à restituição dos valores descontados, em dobro; c) Improcedência do pedido de danos morais pelas razões acima expostas. Sem custas e honorários.`;
  const s = r(t);
  assert.equal(s.resultado, 'parcial');
  assert.equal(s.danoMoral, false);
});

test('procedente com dano moral e valor', () => {
  const s = r(`Ante o exposto, JULGO PROCEDENTE o pedido para declarar inexistente o débito da tarifa de comunicação digital,
    condenar o réu à restituição em dobro de R$ 286,80 e ao pagamento de indenização por danos morais de R$ 3.000,00, corrigidos.`);
  assert.equal(s.resultado, 'procedente');
  assert.equal(s.danoMoral, true);
  assert.equal(s.valorDanoMoral, 3000);
});

test('parcial com dano moral fixado no valor de', () => {
  const s = r(`Isto posto, julgo parcialmente procedentes os pedidos para condenar o banco à repetição em dobro e fixar
    a indenização por dano moral no valor de R$ 5.000,00 (cinco mil reais).`);
  assert.equal(s.resultado, 'parcial');
  assert.equal(s.danoMoral, true);
  assert.equal(s.valorDanoMoral, 5000);
});

test('improcedente', () => {
  const s = r('Pelo exposto, JULGO IMPROCEDENTES os pedidos formulados na inicial, com resolução do mérito, nos termos do art. 487, I, do CPC.');
  assert.equal(s.resultado, 'improcedente');
  assert.equal(s.danoMoral, false);
});

test('procedente um pedido e improcedente outro = parcial', () => {
  const s = r('Ante o exposto, julgo procedente o pedido de restituição em dobro e improcedente o pedido de danos morais.');
  assert.equal(s.resultado, 'parcial');
  assert.equal(s.danoMoral, false);
});

test('extinção sem mérito', () => {
  const s = r('Diante do exposto, EXTINGO O PROCESSO SEM RESOLUÇÃO DO MÉRITO, com fundamento no art. 485, VIII, do CPC, homologando a desistência.');
  assert.equal(s.resultado, 'extinto');
  assert.equal(s.danoMoral, null);
});

test('acordo homologado', () => {
  const s = r('Isto posto, HOMOLOGO o acordo celebrado entre as partes para que surta seus efeitos e julgo extinto o processo com resolução do mérito (art. 487, III, b).');
  assert.equal(s.resultado, 'acordo');
});

test('projeto de juiz leigo homologado: vale o dispositivo do projeto', () => {
  const s = r(`PROJETO DE SENTENÇA. Ante o exposto, OPINO por JULGAR PROCEDENTE o pedido para condenar o réu ao pagamento de
    R$ 2.000,00 a título de danos morais. Homologo o projeto de sentença, nos termos do art. 40 da Lei 9.099/95.`);
  assert.equal(s.resultado, 'procedente');
  assert.equal(s.danoMoral, true);
  assert.equal(s.valorDanoMoral, 2000);
});

test('palavras-chave: todas as palavras ou a frase exata', () => {
  const t = 'Descontos sob a rubrica Tarifa Comunicação Digital na conta do autor';
  assert.ok(contemPalavras(t, 'tarifa comunicação digital'));
  assert.ok(contemPalavras(t, '"tarifa comunicacao digital"'));
  assert.ok(!contemPalavras(t, '"tarifa de comunicação digital"'));
  assert.ok(!contemPalavras(t, 'débito seguro'));
});

test('publicação de sentença identificada pelo tipo ou pelo dispositivo', () => {
  assert.ok(pareceSentenca({ tipoDocumento: 'Sentença', texto: '' }));
  assert.ok(pareceSentenca({ tipoDocumento: 'Intimação', texto: 'Ante o exposto, julgo improcedentes os pedidos.' }));
  assert.ok(!pareceSentenca({ tipoDocumento: 'Despacho', texto: 'Intime-se a parte autora.' }));
});
