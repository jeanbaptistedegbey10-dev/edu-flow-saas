/**
 * Vérification de la validation des URLs de logo (exécuté via `tsx`, sans DB).
 */
import { isValidLogoUrl } from "../src/lib/logo-url";
const CASES: Array<[string, boolean]> = [
  ["/logo.png", true],
  ["/branding/marque.svg", true],
  ["https://cdn.exemple.com/logo.png", true],
  ["http://exemple.io/a.jpg", true],
  ["data:image/png;base64,iVBORw0KGgo=", true],
  ["javascript:alert(1)", false],
  ["data:text/html;base64,PHN2Zz4=", false],
  ["not a url", false],
  ["", false],
];

let failures = 0;

for (const [value, expected] of CASES) {
  const actual = isValidLogoUrl(value);
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${JSON.stringify(value).padEnd(40)} -> ${actual ? "VALID" : "REJECTED"}`
  );
}

console.log(failures === 0 ? "\n✓ Tous les cas passent." : `\n✗ ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
