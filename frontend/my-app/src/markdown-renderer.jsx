import { useState } from 'react';
import ReactMarkdown from 'react-markdown'
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";


const CHUNK_DELIMITER = "<<<CHUNK_DELIMITER>>>";


// This is a "remark plugin" - a function that transforms markdown before it's rendered
// It adds interactive features to text by wrapping each chunk in <span> elements
function remarkInteractiveChunks() {
  // This function returns another function that takes the markdown "tree"
  return (tree) => {
    let currentChunkId = 0; // Tracks which chunk we are currently rendering

    // "visit" is a helper that finds all text nodes in the tree
    // It runs the callback function for each text node it finds
    visit(tree, "text", (node, index, parent) => {
      if (!parent) return; // Skip if there's no parent (safety check)

      // Split the text where we inserted chunk separators.
      // We keep the separator in the result so we can move to the next chunk ID.
      const parts = node.value.split(CHUNK_DELIMITER);

      // Create new nodes for each part
      const newNodes = [];
      parts.forEach((part, partIndex) => {
        // Add text for the current chunk (including whitespace/newlines as-is)
        if (part !== "") {
          newNodes.push({
            type: "element",
            data: {
              hName: "span",
              hProperties: {
                "data-chunk-id": currentChunkId,
              },
            },
            children: [{ type: "text", value: part }],
          });
        }

        // Every separator means we move from one chunk to the next
        if (partIndex < parts.length - 1) {
          currentChunkId += 1;
        }
      });

      // Replace the original text node with all the new span nodes and whitespace
      // splice removes 1 item (the original text) and inserts all the new nodes in its place
      parent.children.splice(index, 1, ...newNodes);

      // Return the new index so the visitor continues from the right place
      return index + newNodes.length;
    });
  };
}

function createInteractiveSpanRenderer({ activeChunkId, onToggleChunk }) {
  return function RenderInteractiveSpan({ node, ...props }) {
    const id = Number(props["data-chunk-id"]);
    const isActive = activeChunkId === id;

    return (
      <span
        {...props}
        onClick={() => {
          console.log("clicked chunk", id);
          onToggleChunk(id);
        }}
        className={`cursor-pointer hover:bg-gray-300 ${isActive ? "bg-yellow-500" : ""}`}
      />
    );
  };
}


function MarkdownRenderer() {
  const textChunks = [
    "Hello ",
    "world ",
    "**!**",
  ];

  const [activeChunkId, setActiveChunkId] = useState(null);
  const handleToggleChunk = (id) => {
    setActiveChunkId((prev) => (prev === id ? null : id));
  };

  // ReactMarkdown expects one markdown string, so we join chunks with an internal delimiter.
  // The remark plugin reads that delimiter and maps rendered text back to each chunk ID.
  const markdown_text = textChunks.join(CHUNK_DELIMITER);

  // Tell ReactMarkdown to:
  // 1. Use our remarkInteractiveChunks plugin to transform the markdown
  // 2. Use remarkGfm for GitHub-flavored markdown features
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkInteractiveChunks]}
      skipHtml={false}
      components={{
        span: createInteractiveSpanRenderer({
          activeChunkId,
          onToggleChunk: handleToggleChunk,
        }),
      }}
    >
      {markdown_text}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;