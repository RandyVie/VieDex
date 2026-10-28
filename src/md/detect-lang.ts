// Guess a code block's language from what it contains. Plain rules, no AI: each language
// earns points for telltale signs, and the best score wins if it is clear enough.

export interface Language {
  /** Written after the ``` fence, the name most Markdown tools understand. */
  id: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'html', label: 'HTML' },
  { id: 'php', label: 'PHP' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'bash', label: 'Command line' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'XML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C / C++' },
  { id: 'swift', label: 'Swift' },
  { id: 'ruby', label: 'Ruby' },
];

// Short names people write after ``` for the same languages.
const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash',
  py: 'python', yml: 'yaml', md: 'markdown', htm: 'html', rb: 'ruby', rs: 'rust', golang: 'go',
  c: 'cpp', cc: 'cpp', 'c++': 'cpp', h: 'cpp', hpp: 'cpp', sass: 'scss',
};

/** One id per language, so `ts` and `typescript` count as the same. */
export function normalizeLanguage(id: string): string {
  const key = id.toLowerCase();
  return ALIASES[key] ?? key;
}

export function languageLabel(id: string): string {
  const key = normalizeLanguage(id);
  return LANGUAGES.find((l) => l.id === key)?.label ?? id;
}

/** The language written after the ``` of a code block, normalized, or '' when it has none. */
export function codeBlockLanguage(content: string): string {
  const m = /^\s*```([\w+#.-]+)/.exec(content);
  return m ? normalizeLanguage(m[1]) : '';
}

type Rule = [RegExp, number];

// Signs per language, with how much each counts. Strong signs (a <?php tag) count a lot.
const RULES: Record<string, Rule[]> = {
  php: [[/<\?php/, 10], [/\$[a-z_]\w*\s*(=|->|\[)/i, 3], [/->\w+\(/, 2], [/\becho\s/, 2], [/\bfunction\s+\w+\s*\([^)]*\$/, 3], [/\b(namespace|use)\s+[A-Z][\w\\]+;/, 3]],
  html: [[/<!doctype html/i, 10], [/<\/?(html|head|body|div|span|section|article|header|footer|nav|main|ul|ol|li|p|a|img|button|form|input|table|h[1-6])\b[^>]*>/i, 4], [/<\/[a-z]+>/i, 1]],
  xml: [[/^\s*<\?xml/, 10], [/<\/?[a-z]+:[a-z]+/i, 3]],
  css: [[/[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^{}]*[\w-]+\s*:\s*[^;{}]+;/, 4], [/@media\s*\(/, 4], [/:root\s*\{/, 4], [/--[\w-]+\s*:/, 2], [/\b(px|rem|em|vh|vw)\b/, 1]],
  scss: [[/\$[\w-]+\s*:/, 4], [/@(mixin|include|extend|use)\b/, 5], [/&(:|\.|-|\s)/, 2]],
  javascript: [[/\b(const|let|var)\s+\w+\s*=/, 2], [/=>/, 2], [/\bfunction\s*\w*\s*\(/, 2], [/\bconsole\.log\(/, 3], [/\b(document|window)\./, 3], [/\bimport\s+.+\s+from\s+['"]/, 3], [/\bexport\s+(default|const|function)/, 2], [/\brequire\(['"]/, 3]],
  typescript: [[/:\s*(string|number|boolean|void|unknown|any|never)\b/, 4], [/\binterface\s+\w+\s*\{/, 5], [/\btype\s+\w+\s*=/, 4], [/<\w+(,\s*\w+)*>\(/, 2], [/\bas\s+const\b/, 3], [/\b(public|private|readonly)\s+\w+:/, 2]],
  bash: [[/^#!.*\b(ba|z)?sh\b/m, 10], [/^\s*\$\s+\w/m, 4], [/^\s*(sudo\s+)?(npm|npx|yarn|pnpm|git|cd|ls|curl|wget|brew|apt|mkdir|rm|cp|mv|chmod|docker|ssh|cat|grep|echo|export|source|pip|composer|php artisan)\b/m, 4], [/\s--?[a-z][\w-]*/, 1], [/\|\s*(grep|xargs|sort|head|tail)\b/, 3], [/&&/, 1]],
  python: [[/^\s*def\s+\w+\(.*\)\s*(->\s*[\w[\], ]+)?:\s*$/m, 5], [/^\s*class\s+\w+(\(.*\))?:\s*$/m, 5], [/^\s*(import\s+\w+|from\s+[\w.]+\s+import)\b/m, 3], [/\bprint\(/, 2], [/\bself\./, 3], [/\b(None|True|False)\b/, 1], [/^\s*(elif|except|with)\b.*:\s*$/m, 3]],
  sql: [[/\bSELECT\b[\s\S]+\bFROM\b/i, 6], [/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i, 6], [/\b(WHERE|JOIN|GROUP BY|ORDER BY)\b/i, 2]],
  json: [],
  yaml: [[/^[\w-]+:\s+\S/m, 1], [/^\s*-\s+[\w-]+:\s/m, 2], [/^---\s*$/m, 2]],
  markdown: [[/^#{1,6}\s+\w/m, 2], [/^\s*[-*]\s+\[[ x]\]/m, 3], [/\[[^\]]+\]\(https?:\/\//, 2]],
  go: [[/\bpackage\s+\w+/, 5], [/\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\(/, 4], [/:=/, 2], [/\bfmt\.\w+\(/, 4]],
  rust: [[/\bfn\s+\w+\s*(<[^>]*>)?\(/, 4], [/\blet\s+mut\b/, 4], [/\b\w+!\(/, 2], [/\bimpl\b|\bpub\s+fn\b/, 4], [/::/, 1]],
  java: [[/\bpublic\s+(static\s+)?(final\s+)?(class|void|int|String)\b/, 5], [/\bSystem\.out\.println\(/, 6], [/\bimport\s+java\./, 6]],
  cpp: [[/^\s*#include\s*[<"]/m, 8], [/\bstd::/, 5], [/\bint\s+main\s*\(/, 4], [/\bprintf\(/, 3]],
  swift: [[/\bimport\s+(SwiftUI|UIKit|Foundation)\b/, 8], [/\bfunc\s+\w+\(.*\)\s*->/, 3], [/\b(var|let)\s+\w+\s*:\s*[A-Z]\w*/, 2], [/\bguard\s+let\b/, 5]],
  ruby: [[/^\s*def\s+\w+[^:]*$/m, 3], [/^\s*end\s*$/m, 2], [/\bputs\s/, 3], [/\brequire\s+['"]/, 2], [/\bdo\s*\|\w+\|/, 4]],
};

function isJson(code: string): boolean {
  const t = code.trim();
  if (!/^[[{]/.test(t)) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** The best guess for a language, or null when nothing stands out. */
export function detectLanguage(code: string): string | null {
  const text = code.trim();
  if (text.length < 4) return null;
  if (isJson(text)) return 'json';

  const scores = new Map<string, number>();
  for (const [lang, rules] of Object.entries(RULES)) {
    let score = 0;
    for (const [re, points] of rules) if (re.test(text)) score += points;
    if (score) scores.set(lang, score);
  }
  // YAML has few keywords, but most of its lines look like `key: value` or `- item`.
  const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const yamlish = lines.filter((l) => /^\s*(-\s+)?[\w"'-]+:(\s|$)/.test(l) || /^\s*-\s+\S/.test(l)).length;
  if (lines.length >= 2 && yamlish / lines.length >= 0.7 && !/[;{}]\s*$/m.test(text)) scores.set('yaml', (scores.get('yaml') ?? 0) + 5);

  // A language that builds on another wins ties with it: SCSS over CSS, TypeScript over JavaScript.
  if (scores.has('scss') && scores.has('css')) scores.set('scss', scores.get('scss')! + scores.get('css')!);
  if (scores.has('typescript') && scores.has('javascript')) scores.set('typescript', scores.get('typescript')! + scores.get('javascript')!);
  if ((scores.get('php') ?? 0) >= 10) scores.delete('html');

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < 3) return null;
  // Too close to call: better no label than a wrong one.
  if (second && best[1] - second[1] < 2 && best[1] < 8) return null;
  return best[0];
}
