import type { Metadata } from "next";
import Editor from "@/components/Editor";

export const metadata: Metadata = { title: "Miniamaker — Éditeur" };

export default function AppPage() {
  return <Editor />;
}
