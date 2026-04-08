import { Viewer, Worker } from '@react-pdf-viewer/core';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';




function PdfRenderer({ pdfFilePath, statements=[] }) {


  // Color the sentences that belong to statements based on their verification result
  const getStatementColor = (verificationResult) => {
    let baseColor;
    switch (verificationResult) {
      case 'Supported':
        baseColor = '0, 128, 0'; // Green
        break;
      case 'Contradicted':
        baseColor = '255, 0, 0'; // Red
        break;
      default:
        baseColor = '255, 165, 0'; // Default to orange for all other results, including 'Unverified' and undefined
        break;
    }
    return baseColor;
  };


  const highlightPluginInstance = highlightPlugin({
    trigger: Trigger.None,
    renderHighlights: (props) => (
      <>
        {(Array.isArray(statements) ? statements : [])
          .flatMap((statement, statementIndex) => {
            const sentence = statement?.sentence;
            const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens : [];

            return tokens
              .filter((token) => token?.pageIndex === props.pageIndex)
              .map((token, tokenIndex) => (
                <div
                  key={`${sentence?.id ?? statementIndex}-${tokenIndex}`}
                  title={sentence?.text ?? ''}
                  style={{
                    ...props.getCssProperties(token, props.rotation),
                    backgroundColor: `rgba(${getStatementColor(statement?.verification_result)}, 0.5)`,
                  }}
                />
              ));
          })}
      </>
    ),
  });

  return (
    <div className="h-full w-full overflow-hidden rounded-lg bg-bg_shade_1">
      <Worker workerUrl={workerUrl}>
        <Viewer fileUrl={pdfFilePath} plugins={[highlightPluginInstance]} />
      </Worker>
    </div>
  );
}

export default PdfRenderer;