// List the visible English strings still in a component, so the translation
// table can be built from what is actually there rather than from memory.
//
// Comments are skipped (they are code, and stay English); what is reported is
// JSX text nodes and quoted literals that read like a sentence a player sees.

import fs from "node:fs";

const files = process.argv.slice(2);
if (!files.length) {
  console.log("usage: node scripts/list-english.mjs <file...>");
  process.exit(1);
}

// A line is a comment if it opens with one, which is how this codebase writes them.
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

// Words that mark a string as English rather than a token, an id or a class.
const ENGLISH = /\b(the|and|of|to|a|is|are|was|were|be|been|has|have|had|for|with|from|that|this|it|its|by|on|in|at|as|not|no|you|your|they|their|what|which|when|who|whom|nothing|every|each|all|any|more|than|then|so|but|or|if|out|up|down|over|under|into|only|still|never|always|now|here|there|one|two|three|first|last|next|new|old|open|close|send|save|edit|delete|cancel|begin|start|stop|skip|choose|write|read|hold|held|move|moved|paid|pay)\b/i;

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const found = [];
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    const hits = new Set();
    // JSX text between tags
    for (const m of line.matchAll(/>([^<>{}]{4,})</g)) hits.add(m[1].trim());
    // Quoted literals long enough to be prose
    for (const m of line.matchAll(/"([^"\\]{4,})"/g)) hits.add(m[1].trim());
    for (const text of hits) {
      if (!text || !ENGLISH.test(text)) continue;
      if (/^[a-z-]+$/.test(text)) continue;               // a css value or a key
      if (/^var\(|^--oh|^\d|px$|rem$|%$/.test(text)) continue;
      if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) continue;       // already French
      found.push(`${i + 1}\t${text}`);
    }
  });
  console.log(`\n=== ${file} — ${found.length} ===`);
  for (const line of found) console.log(line);
}
