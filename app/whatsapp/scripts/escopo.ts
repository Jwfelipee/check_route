/**
 * Evidência do critério "a IA não vaza dados de outras rotas": conecta ao MCP como um motorista
 * (token de escopo emitido pela API para ele) e tenta enxergar o que não é dele.
 * Precisa da API (7333) e do MCP (7335) no ar.   npm run escopo -w app/whatsapp [telefone]
 */
import { api } from '../src/api.js';
import { abrirConsulta } from '../src/mcp.js';

const telefone = process.argv[2] || '5511990001001'; // motorista da T02 (contato de exemplo)
const contato = await api.contato(telefone);
if (!contato) throw new Error(`Número ${telefone} não cadastrado`);
const minhas = contato.rotas.map((r) => r.rota_id);
const outras = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T99'].filter((r) => !minhas.includes(r));
console.log(`Contato: ${contato.papel}, rotas permitidas: ${minhas.join(', ')}\n`);

const c = await abrirConsulta(contato.id);
if (!c) throw new Error('MCP indisponível');
let falhas = 0;
const confere = (ok: boolean, texto: string) => { console.log(`${ok ? '✔' : '✖'} ${texto}`); if (!ok) falhas++; };

const nomes = c.ferramentas.map((f) => f.name);
console.log(`Ferramentas oferecidas a ele: ${nomes.join(', ')}\n`);
confere(!nomes.includes('historico_acoes') && !nomes.includes('atrasos') || contato.papel !== 'motorista', 'motorista não recebe as ferramentas de gestão (atrasos, histórico de ações)');

for (const nome of nomes) {
  const minha = await c.chamar(nome, { rota_id: minhas[0] });
  confere(!minha.includes('"erro"'), `${nome}(${minhas[0]}) responde para a própria rota`);
  for (const fora of outras) {
    const r = await c.chamar(nome, { rota_id: fora });
    confere(r === JSON.stringify({ erro: 'rota não disponível para este contato' }), `${nome}(${fora}) recusa, igual a rota inexistente, sem revelar nada`);
  }
  confere(!/\+?\d{2}\s?\(?\d{2}\)?\s?9\d{4}|telefone|reportado_por|VEIC-/i.test(minha), `${nome}: saída sem telefone, contato nem placa`);
}
await c.fechar();
console.log(falhas ? `\n${falhas} falha(s)` : '\nEscopo respeitado em todas as ferramentas.');
process.exit(falhas ? 1 : 0);
