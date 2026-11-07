/**
 * @category helper-puro — CSV para planilha em português: separador `;`, BOM UTF-8
 * (o Excel abre os acentos certos) e proteção contra injeção de fórmula.
 */

const FORMULA_START = /^[=+\-@]/;

function cell(value: string | number): string {
  if (typeof value === "number") return String(value);
  // Texto que começa como fórmula ganha `'` para a planilha não executá-lo.
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Baixa o conteúdo como arquivo; mesmo mecanismo da exportação de playlists (desktop e web). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
