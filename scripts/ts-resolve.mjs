/* Lets plain `node` import this repo's TypeScript the way the bundlers do.
 *
 * Node 24 strips types by itself, so a `.ts` file runs unchanged — but it
 * still demands a file extension on every relative specifier, and the source
 * here is written for Next/Turbopack, which do not. So
 * `export * from "./types"` inside packages/core/src/index.ts fails under node
 * and succeeds under the build. That is why the existing tests all import a
 * LEAF module (`../packages/core/src/overrides.ts`) and never the package:
 * anything that reaches `@rof/core` pulls in index.ts and dies on the first
 * extensionless line.
 *
 * This hook closes that gap: an extensionless relative import that does not
 * resolve is retried with `.ts`, then as `/index.ts`. Nothing else changes —
 * a specifier that already resolves is left completely alone, so it cannot
 * mask a genuinely missing module.
 *
 * Use it when a test needs a module that imports across packages:
 *
 *   node --import ./scripts/ts-resolve.mjs tests/rover.test.mjs
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  /* The hook body, as a data: URL so this file is the only one to install. */
  `data:text/javascript,
   export async function resolve(specifier, context, next) {
     try {
       return await next(specifier, context);
     } catch (err) {
       const retryable =
         (err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "ERR_UNSUPPORTED_DIR_IMPORT") &&
         (specifier.startsWith("./") || specifier.startsWith("../")) &&
         !/\\.[cm]?[jt]sx?$/.test(specifier);
       if (!retryable) throw err;
       for (const suffix of [".ts", "/index.ts", ".tsx"]) {
         try {
           return await next(specifier + suffix, context);
         } catch {
           /* Try the next shape. */
         }
       }
       throw err;
     }
   }`,
  pathToFileURL("./"),
);
