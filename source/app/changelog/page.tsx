import Link from "next/link";
import { changelog } from "@/lib/changelog";

export const metadata = { title: "更新日志 · 序流" };

export default function ChangelogPage() {
  return (
    <main className="changelogPage">
      <Link href="/">← 返回序流</Link>
      <h1>更新日志</h1>

      {changelog.map((entry) => (
        <article className="panel changelogEntry" key={`${entry.date}-${entry.title}`}>
          <time dateTime={entry.date}>{entry.date}</time>
          <h2>{entry.title}</h2>
          <ul>{entry.changes.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>如何使用？</h3>
          <ol>{entry.instructions.map((item) => <li key={item}>{item}</li>)}</ol>
          <h3>使用说明</h3>
          <ul>{entry.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      ))}
    </main>
  );
}
