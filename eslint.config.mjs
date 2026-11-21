import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Garde-fous de sécurité : ces écritures sont refusées par `npm run lint`.
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message:
            "Risque d'injection SQL : utilisez les requêtes Prisma, ou $queryRaw`…` / $executeRaw`…` (gabarits paramétrés). Jamais les variantes « Unsafe ».",
        },
        {
          selector: "CallExpression[callee.object.name='Prisma'][callee.property.name='raw']",
          message:
            "Risque d'injection SQL : Prisma.raw() insère du texte tel quel dans la requête. Utilisez Prisma.sql`…` avec des paramètres.",
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "Risque de faille XSS : n'injectez jamais de HTML brut. Laissez React échapper le texte.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client Prisma généré :
    "src/generated/**",
    // Scripts de test (CommonJS, pilotés par Playwright) :
    "tests/**",
  ]),
]);

export default eslintConfig;
