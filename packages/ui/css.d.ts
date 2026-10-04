/* CSS-module typing for a standalone typecheck of this package.
 *
 * Next supplies this through next-env.d.ts inside an app, but `tsc --noEmit`
 * run here has no Next ambient types to borrow, and every `import s from
 * "./rail.module.css"` would be an unresolved module.
 */
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
