import { Link } from "@tanstack/react-router";
import { brawlPageContent, type BrawlHelpPage } from "../../../../shared/brawl-page-content";

export function BrawlPageHelp({ page }: { page: BrawlHelpPage }) {
  const content = brawlPageContent[page];
  return (
    <section className="max-w-5xl space-y-6 border-t border-border pt-8" aria-labelledby={`${page}-help-title`} lang="en">
      <h2 id={`${page}-help-title`} className="scroll-mt-24 font-display text-2xl md:scroll-mt-48 md:text-3xl">{content.workflowTitle}</h2>
      <ol className="grid gap-5 md:grid-cols-3">
        {content.steps.map((step, index) => (
          <li key={step.title} className="space-y-2">
            <h3 className="font-semibold"><span className="text-primary">{index + 1}. </span>{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
          </li>
        ))}
      </ol>
      <div className="space-y-5">
        {content.questions.map((item) => (
          <div key={item.question} className="space-y-2">
            <h3 className="font-semibold">{item.question}</h3>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
          </div>
        ))}
      </div>
      <nav aria-label="Continue researching brawler picks" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
        {content.links.map((link) => <Link key={link.path} to={link.path} className="font-medium text-primary underline underline-offset-4">{link.label}</Link>)}
        <a href="https://statsconnect.app/data-methodology" className="text-muted-foreground underline underline-offset-4">Data sources and methodology</a>
      </nav>
    </section>
  );
}
