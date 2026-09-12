import { Container } from "@/components/ui/Container";
import type { LegalDoc } from "@/lib/content/legal";

/**
 * Вёрстка правового документа.
 *
 * Колонка нарочно узкая: юридический текст читают подряд, а строки
 * длиннее ~75 знаков теряются при переходе на следующую. Нумерация
 * пунктов идёт внутри самого текста, поэтому своих счётчиков не добавляем.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <section className="torn-5 pb-20 pt-24 paper-light sm:pb-24 sm:pt-28">
      <Container>
        <article className="mx-auto max-w-[46rem]">
          {doc.blocks.map((block, i) => {
            if (block.type === "h") {
              return (
                <h2
                  key={i}
                  className="mt-12 border-t border-ink/10 pt-8 font-display text-xl leading-tight text-ink first:mt-0 first:border-0 first:pt-0 sm:text-2xl"
                >
                  {block.text}
                </h2>
              );
            }

            if (block.type === "list") {
              return (
                <ul key={i} className="mt-4 flex flex-col gap-2">
                  {block.items.map((item, j) => (
                    <li
                      key={j}
                      className="flex gap-3 text-[0.94rem] leading-relaxed text-ink/70"
                    >
                      <span
                        aria-hidden
                        className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              );
            }

            return (
              <p
                key={i}
                className="mt-4 text-[0.94rem] leading-relaxed text-ink/70"
              >
                {block.text}
              </p>
            );
          })}
        </article>
      </Container>
    </section>
  );
}
