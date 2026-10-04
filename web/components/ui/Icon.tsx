/* Moved to @rof/ui.
 *
 * The desk draws the same glyphs, and a second copy of this file is how the
 * two deployments end up with two different chevrons. Re-exported rather than
 * rewritten at every call site: ~40 files import from here, and the import
 * path is not what was wrong.
 */
export { Icon, type IconName } from "@rof/ui";
