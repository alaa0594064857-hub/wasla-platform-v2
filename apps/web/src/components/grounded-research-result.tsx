"use client";

type Props = { value: string };

const suggestionMarker = "\n\nGoogle Search suggestion:\n";
const sourcesMarker = "\nGrounded sources:\n";

export function GroundedResearchResult({ value }: Props) {
  const suggestionAt = value.indexOf(suggestionMarker);
  const withoutSuggestion = suggestionAt >= 0 ? value.slice(0, suggestionAt) : value;
  const suggestionHtml = suggestionAt >= 0 ? value.slice(suggestionAt + suggestionMarker.length).trim() : "";
  const sourcesAt = withoutSuggestion.indexOf(sourcesMarker);
  const body = sourcesAt >= 0 ? withoutSuggestion.slice(0, sourcesAt) : withoutSuggestion;
  const sourceLines = sourcesAt >= 0
    ? withoutSuggestion.slice(sourcesAt + sourcesMarker.length).split("\n").filter(Boolean)
    : [];

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm leading-7">{body}</p>
      {sourceLines.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-bold text-slate-600">Grounded sources / المصادر</h4>
          <ul className="list-inside list-disc space-y-1 text-xs leading-6">
            {sourceLines.map((line, index) => {
              const match = line.match(/^\s*\[\d+\]\s*(.*?)\s+—\s+(https?:\/\/\S+)\s*$/);
              return (
                <li key={index}>
                  {match ? (
                    <a className="break-all text-blue-700 underline" href={match[2]} target="_blank" rel="noreferrer">{match[1] || match[2]}</a>
                  ) : line}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {suggestionHtml ? (
        <iframe
          title="Google Search suggestions"
          srcDoc={suggestionHtml}
          sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation"
          className="block w-full rounded-lg border-0"
          style={{ height: 112 }}
        />
      ) : null}
    </div>
  );
}
