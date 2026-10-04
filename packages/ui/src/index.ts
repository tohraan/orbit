/* @rof/ui — the components both deployments draw with.
 *
 * @rof/styles already stops the portal and the desk disagreeing about what
 * navy is. This stops them disagreeing about what a button, a field, a pill or
 * a navigation rail is, which is the difference a user actually feels: tokens
 * match on a colour picker, components match on sight.
 */

export { Icon, type IconName } from "./Icon";
export { Rail, isActive, initialsOf, type RailItem, type RailFoot } from "./Rail";
export {
  Button,
  buttonClass,
  Field,
  Input,
  Textarea,
  Select,
  Pill,
  Banner,
  Spinner,
  type ButtonTone,
  type PillTone,
  type BannerTone,
} from "./Control";

export { ThemeToggle } from "./ThemeToggle";
