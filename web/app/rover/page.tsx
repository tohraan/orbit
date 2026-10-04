import type { Metadata } from "next";
import { RoverScreen } from "./RoverScreen";
import { AGENT_NAME } from "@/components/layout/brand";

export const metadata: Metadata = {
  title: AGENT_NAME,
  description: `Ask ${AGENT_NAME} what you are looking for and it searches the index for you.`,
};

export default function RoverPage() {
  return <RoverScreen />;
}
