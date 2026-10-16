import { Section, type SectionProps } from "./Section";

export type DisclosureProps = SectionProps;

/** A Section that starts collapsed — for optional or rarely-touched groups.
 * Same component and grammar as Section; only the default differs, so the two
 * names just express intent (essential vs. advanced) at the call site. */
export function Disclosure(props: SectionProps) {
  return <Section defaultOpen={false} {...props} />;
}
