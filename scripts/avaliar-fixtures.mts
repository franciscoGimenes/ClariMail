/**
 * Roda o analisador nas fixtures de tests/fixtures/emails e mostra a nota
 * e o veredito de cada uma.
 *
 *   npm run fixtures            -> usa o Gemini se GEMINI_API_KEY existir
 *                                  (lida do .env.local), senão a simulação
 *   npm run fixtures -- --sim   -> força a simulação
 *
 * Só imprime nome do arquivo, resultado e tempo; nunca o texto do e-mail.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analisarEmail,
  ErroAnalise,
  MODELO_PADRAO,
  type ModoAnalise,
} from "../lib/analisador";

try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local
}

const modo: ModoAnalise =
  process.argv.includes("--sim") || !process.env.GEMINI_API_KEY
    ? "simulacao"
    : "gemini";

const pasta = join(process.cwd(), "tests", "fixtures", "emails");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".txt")).sort();

console.log(
  `Modo: ${modo}${modo === "gemini" ? ` (${process.env.GEMINI_MODEL || MODELO_PADRAO || "sem modelo definido"})` : ""}\n`,
);

// O plano gratuito do Gemini aceita poucas requisições por minuto (5 em
// alguns modelos). Espaçamos as chamadas para não estourar o limite.
const PAUSA_ENTRE_CHAMADAS_MS = modo === "gemini" ? 13_000 : 0;

for (const [i, arquivo] of arquivos.entries()) {
  if (i > 0 && PAUSA_ENTRE_CHAMADAS_MS) {
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CHAMADAS_MS));
  }
  const texto = readFileSync(join(pasta, arquivo), "utf8");
  const inicio = performance.now();
  try {
    const r = await analisarEmail(texto, modo);
    const ms = Math.round(performance.now() - inicio);
    console.log(
      `${arquivo.padEnd(26)} nota ${String(r.nota).padStart(3)}  ${r.veredito.padEnd(9)} ${ms} ms`,
    );
    console.log(`  ${r.resumo}`);
    for (const i of r.indicios) {
      console.log(`  - [${i.gravidade}] ${i.titulo}: ${i.explicacao}`);
      console.log(`    trecho: ${i.trecho === null ? "(nenhum)" : JSON.stringify(i.trecho)}`);
    }
    console.log("");
  } catch (erro) {
    const motivo = erro instanceof ErroAnalise ? erro.motivo : "desconhecido";
    console.log(`${arquivo.padEnd(26)} FALHOU (${motivo})\n`);
  }
}
