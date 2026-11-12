import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import ResultadoView from "@/components/ResultadoView";

export const metadata: Metadata = {
  title: "Resultado da análise | ClariMail",
};

export default function ResultadoPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
          <ResultadoView />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
