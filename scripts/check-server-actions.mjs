// Garde-fou : dans tout fichier « use server », chaque fonction exportée doit
// commencer par `await requireUser();`. Une action serveur est une adresse
// publique ; le proxy n'est qu'un premier filtre.
//
// Seule exception : la page de connexion (on ne peut pas exiger une session
// pour se connecter ou se déconnecter).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = "src";
const EXEMPT = new Set(["src/app/connexion/actions.ts"]);

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "generated") yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(entry)) {
      yield path;
    }
  }
}

function startsWithRequireUser(body) {
  const first = body?.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const expression = first.expression;
  if (!ts.isAwaitExpression(expression) || !ts.isCallExpression(expression.expression)) return false;
  const callee = expression.expression.expression;
  return ts.isIdentifier(callee) && callee.text === "requireUser";
}

const problems = [];
let checked = 0;

for (const file of sourceFiles(ROOT)) {
  const path = relative(".", file).split("\\").join("/");
  const source = ts.createSourceFile(path, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const first = source.statements[0];
  const isServerFile =
    first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
  if (!isServerFile || EXEMPT.has(path)) continue;

  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!exported) continue;

    if (ts.isFunctionDeclaration(statement)) {
      checked += 1;
      if (!startsWithRequireUser(statement.body)) {
        problems.push(`${path} : « ${statement.name?.text} » ne commence pas par \`await requireUser();\``);
      }
    } else if (ts.isVariableStatement(statement)) {
      // `export const action = async () => { … }` : même exigence.
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          checked += 1;
          const body = ts.isBlock(init.body) ? init.body : null;
          if (!startsWithRequireUser(body)) {
            problems.push(`${path} : « ${declaration.name.getText(source)} » ne commence pas par \`await requireUser();\``);
          }
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error("✗ Actions serveur non protégées :");
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}
console.log(`✓ ${checked} actions serveur vérifiées : toutes commencent par requireUser().`);
