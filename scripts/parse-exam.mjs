import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'ekzamen.md');
const outDir = path.join(root, 'public');
const outPath = path.join(outDir, 'questions.json');

function parse(content) {
  const lines = content.split(/\r?\n/);
  /** @type {{ id: number; question: string; variants: string[] }[]} */
  const questions = [];
  let currentQuestion = null;
  /** @type {string[]} */
  let variants = [];

  function pushIfComplete() {
    if (currentQuestion !== null && variants.length === 5) {
      questions.push({
        id: questions.length + 1,
        question: currentQuestion.trim(),
        variants: variants.map((v) => v.trim()),
      });
      currentQuestion = null;
      variants = [];
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('<question>')) {
      pushIfComplete();
      currentQuestion = trimmed.slice('<question>'.length).trim();
      variants = [];
    } else if (trimmed.startsWith('<variant>')) {
      const text = trimmed.slice('<variant>'.length).trim();
      variants.push(text);
      if (variants.length === 5) {
        pushIfComplete();
      }
    } else if (currentQuestion !== null && variants.length === 0) {
      currentQuestion += ' ' + trimmed;
    }
  }

  pushIfComplete();
  return questions;
}

const md = fs.readFileSync(inputPath, 'utf8');
const data = parse(md);

if (data.length === 0) {
  console.error('parse-exam: no questions parsed from', inputPath);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(data, null, 0), 'utf8');
console.log(`parse-exam: wrote ${data.length} questions to ${outPath}`);
