import readline from "node:readline/promises";

/**
 * Pregunta sí/no solo cuando hay una persona frente a la terminal. En scripts,
 * CI o pipelines devuelve `true` para no colgar el proceso: la advertencia ya
 * se imprimió y la decisión queda en los flags del comando.
 */
export async function confirmInTerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "s" || answer === "si" || answer === "sí" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
