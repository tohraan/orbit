/* Moved to @rof/ui.
 *
 * The desk draws the same glyphs, and a second copy of this file is how the
 * two deployments end up with two different chevrons. Re-exported rather than
 * rewritten at every call site: ~40 files import from here, and the import
 * path is not what was wrong.
 *
 * The icon SET did not move out of the product's reach by moving out of this
 * directory: Rover's glyph was added here on another branch while this change
 * was in flight, and it lives in packages/ui/src/Icon.tsx now, beside every
 * other one. A new glyph goes there.
 */
export { Icon, type IconName } from "@rof/ui";
