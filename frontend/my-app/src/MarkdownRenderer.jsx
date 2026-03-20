import ReactMarkdown from 'react-markdown'
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";


function remarkInteractiveChunks() {
  return (tree) => {
    let idCounter = 0;

    visit(tree, "text", (node, index, parent) => {
      if (!parent) return;

      const parts = node.value.split(/(\s+)/);

      const newNodes = parts.map((part) => {
        if (part.trim() === "") {
          return { type: "text", value: part };
        }

        return {
          type: "element",
          data: {
            hName: "span",
            hProperties: {
              "data-chunk-id": idCounter++,
            },
          },
          children: [{ type: "text", value: part }],
        };
      });

      parent.children.splice(index, 1, ...newNodes);

      return index + newNodes.length;
    });
  };
}




function MarkdownRenderer() {

  let markdown_text = `Hello world **!**`;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkInteractiveChunks]}
      skipHtml={false}
      components={{
        span: ({ node, ...props }) => {
          const id = props["data-chunk-id"];

          return (
            <span
              {...props}
              onClick={() => console.log("clicked chunk", id)}
              className="cursor-pointer hover:bg-yellow-200"
            />
          );
        },
      }}
    >
      {markdown_text}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;