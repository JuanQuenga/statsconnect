import Link from "@/components/Link";
import { clashDeckContent } from "../../../../../shared/clash-deck-content";
import styles from "./DeckHelp.module.css";

export function DeckHelp() {
  const content = clashDeckContent;
  return (
    <section className={`profile-section ${styles.help}`} aria-labelledby="deck-help-title" lang="en">
      <h2 id="deck-help-title">{content.workflowTitle}</h2>
      <p>{content.intro}</p>
      <ol className={styles.steps}>
        {content.steps.map((step, index) => <li key={step.title}><h3>{index + 1}. {step.title}</h3><p>{step.copy}</p></li>)}
      </ol>
      {content.questions.map((item) => <div className={styles.question} key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}
      <nav aria-label="Continue comparing decks" className={styles.links}>
        {content.links.map((link) => <Link key={link.path} href={link.path}>{link.label}</Link>)}
        <a href="https://statsconnect.app/data-methodology">Data sources and methodology</a>
      </nav>
    </section>
  );
}
