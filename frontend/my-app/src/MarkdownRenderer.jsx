import ReactMarkdown from "react-markdown";



function MarkdownRenderer({ }) {

  const markdown = `# Hello

This is **bold** and this is *italic*.`;

  return (
      <ReactMarkdown>{markdown}</ReactMarkdown>
  )
}

export default MarkdownRenderer