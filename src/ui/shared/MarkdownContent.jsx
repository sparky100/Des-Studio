// ui/shared/MarkdownContent.jsx — Lightweight markdown-to-React renderer
// Uses existing theme tokens. No external dependencies.
import { C, FONT, RADIUS, SPACE } from "./tokens.js";

function parseInline(text) {
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push({ type: "code", content: token.slice(1, -1) });
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push({ type: "bold", content: token.slice(2, -2) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push({ type: "italic", content: token.slice(1, -1) });
    } else if (token.startsWith("http")) {
      parts.push({ type: "link", content: token });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts;
}

function renderInline(text, keyPrefix = "") {
  const parts = parseInline(text);
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].content;
  }
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (part.type) {
      case "code":
        return (
          <code key={key} style={{
            background: C.surface, fontFamily: FONT, fontSize: 11,
            padding: "1px 5px", borderRadius: RADIUS.sm, color: C.accent,
          }}>
            {part.content}
          </code>
        );
      case "bold":
        return <strong key={key}>{part.content}</strong>;
      case "italic":
        return <em key={key}>{part.content}</em>;
      case "link":
        return (
          <a key={key} href={part.content} target="_blank" rel="noopener noreferrer" style={{
            color: C.accent, textDecoration: "underline",
          }}>
            {part.content}
          </a>
        );
      default:
        return part.content;
    }
  });
}

function parseBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "codeblock", lang, content: codeLines.join("\n") });
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({ type: "heading", level, content: headingMatch[2] });
      i++;
      continue;
    }

    // Unordered lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered lists
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Blank lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraphs (collect consecutive non-blank, non-special lines)
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" &&
           !lines[i].match(/^#{1,4}\s/) &&
           !lines[i].trimStart().startsWith("```") &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join(" ") });
    }
  }

  return blocks;
}

export function MarkdownContent({ text, style }) {
  if (!text) return null;

  const blocks = parseBlocks(text);

  return (
    <div style={{ ...style }}>
      {blocks.map((block, i) => {
        const key = `md-${i}`;
        switch (block.type) {
          case "heading": {
            const sizes = { 1: 16, 2: 14, 3: 13, 4: 12 };
            const colors = { 1: C.text, 2: C.text, 3: C.text, 4: C.muted };
            return (
              <div key={key} style={{
                fontSize: sizes[block.level] ?? 12,
                fontWeight: 700,
                color: colors[block.level] ?? C.text,
                fontFamily: FONT,
                marginBottom: SPACE.sm,
                marginTop: i > 0 ? SPACE.md : 0,
              }}>
                {renderInline(block.content, key)}
              </div>
            );
          }
          case "paragraph":
            return (
              <div key={key} style={{
                fontSize: 12, lineHeight: 1.7, color: C.text,
                fontFamily: FONT, marginBottom: SPACE.sm,
              }}>
                {renderInline(block.content, key)}
              </div>
            );
          case "ul":
            return (
              <div key={key} style={{ marginBottom: SPACE.sm }}>
                {block.items.map((item, j) => (
                  <div key={`${key}-${j}`} style={{
                    fontSize: 12, lineHeight: 1.6, color: C.text,
                    fontFamily: FONT, marginBottom: 2, paddingLeft: 16,
                    position: "relative",
                  }}>
                    <span style={{ position: "absolute", left: 4, color: C.muted }}>•</span>
                    {renderInline(item, `${key}-${j}`)}
                  </div>
                ))}
              </div>
            );
          case "ol":
            return (
              <div key={key} style={{ marginBottom: SPACE.sm }}>
                {block.items.map((item, j) => (
                  <div key={`${key}-${j}`} style={{
                    fontSize: 12, lineHeight: 1.6, color: C.text,
                    fontFamily: FONT, marginBottom: 2, paddingLeft: 20,
                  }}>
                    <span style={{ position: "absolute", left: 4, color: C.muted, minWidth: 14 }}>{j + 1}.</span>
                    {renderInline(item, `${key}-${j}`)}
                  </div>
                ))}
              </div>
            );
          case "codeblock":
            return (
              <pre key={key} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: RADIUS.md, padding: SPACE.md,
                fontFamily: FONT, fontSize: 11, lineHeight: 1.5,
                color: C.text, overflow: "auto", marginBottom: SPACE.sm,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {block.content}
              </pre>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
