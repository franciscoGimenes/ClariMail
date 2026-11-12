/**
 * Roda o analisador nas fixtures de tests/fixtures/emails e mostra a nota
 * e o veredito de cada uma.
 *
 *   npm run fixtures            -> usa a Anthropic se ANTHROPIC_API_KEY existir
 *                                  (lida do .env.local), senão a simulação
 *   npm run fixtures -- --sim   -> força a simulação
 *
 * Só imprime nome do arquivo, resultado e tempo; nunca o texto do e-mail.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analisarEmail, ErroAnalise, type ModoAnalise } from "../lib/analisador";

try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local
}

const modo: ModoAnalise =
  process.argv.includes("--sim") || !process.env.ANTHROPIC_API_KEY
    ? "simulacao"
    : "anthropic";

const pasta = join(process.cwd(), "tests", "fixtures", "emails");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".txt")).sort();

console.log(
  `Modo: ${modo}${modo === "anthropic" ? ` (${process.env.ANTHROPIC_MODEL || "claude-haiku-5-5"})` : ""}\n`,
);

for (const arquivo of arquivos) {
  const texto = readFileSync(join(pasta, arquivo), "utf8");
  const inicio = performance.now();
  try {
    const r = await analisarEmail(texto, modo);
    const ms = Math.round(performance.now() - inicio);
    console.log(
      `${arquivo.padEnd(26)} nota ${String(r.nota).padStart(3)}  ${r.veredito.padEnd(9)} ${ms} ms`,
    );
    console.log(`  ${r.resumo}\n`);
  } catch (erro) {
    const motivo = erro instanceof ErroAnalise ? erro.motivo : "desconhecido";
    console.log(`${arquivo.padEnd(26)} FALHOU (${motivo})\n`);
  }
}
