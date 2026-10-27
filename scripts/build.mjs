// Baut dist/victron-shunt-card.js und setzt die Version aus package.json ein.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const src = readFileSync("src/victron-shunt-card.js", "utf8").replace("__VERSION__", pkg.version);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/victron-shunt-card.js", src);
console.log(`dist/victron-shunt-card.js (${(src.length / 1024).toFixed(1)} KB)`);
