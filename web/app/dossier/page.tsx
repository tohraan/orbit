import type { Metadata } from "next";
import { DossierScreen } from "./DossierScreen";

export const metadata: Metadata = {
  title: "Dossier",
  description: "The documents you need for applications, kept in one place.",
};

export default function DossierPage() {
  return <DossierScreen />;
}
