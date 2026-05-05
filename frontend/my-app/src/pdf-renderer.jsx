import { useEffect } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';



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

function PdfRenderer({ state, pdfFilePath, onStatementClick, selectedStatement}) {

  // Extract the statements from the state context
  const statements = state?.context?.statements ?? [];

  // Use the default layout plugin to render the PDF and the 
  // highlight plugin to render the statement highlights and handle statement click events.
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const { jumpToPage } = pageNavigationPluginInstance;

  // Display the first page of the PDF by default, or the page of the selected statement if there is one.
  // To ensure that the viewer re-renders when the selected statement changes, 
  // we can use a key that combines the PDF file path and the selected page index. 
  // This way, when the selected statement changes and has a different page index, 
  // the key will change and force the Viewer component to re-render with the new page.
  const rawSelectedPageIndex = selectedStatement?.sentence?.tokens?.at?.(0)?.pageIndex;
  const selectedPageIndex = Number.isFinite(Number(rawSelectedPageIndex)) ? Number(rawSelectedPageIndex) : null;
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
                  onClick={onStatementClick ? () => onStatementClick(statement) : undefined}
                  style={{
                    ...props.getCssProperties(token, props.rotation),
                    pointerEvents: 'auto',
                    cursor: onStatementClick ? 'pointer' : 'default',
                    zIndex: 2,
                    backgroundColor: `rgba(${getStatementColor(statement?.verification_result)}, ${selectedStatement != null && statement?.sentence?.id === selectedStatement?.sentence?.id ? 0.6 : 0.2})`,
                  }}
                />
              ));
          })}
      </>
    ),
  });

      useEffect(() => {
        if (typeof selectedPageIndex === 'number' && selectedPageIndex >= 0) {
          jumpToPage(selectedPageIndex);
        }
      }, [jumpToPage, selectedPageIndex]);

  return (
    <div className="h-full w-full overflow-hidden rounded-lg bg-bg_shade_1">
      <Worker workerUrl={workerUrl}>
        <Viewer
          fileUrl={pdfFilePath}
          initialPage={0}
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance, pageNavigationPluginInstance]}
        />
      </Worker>
    </div>
  );
}

export default PdfRenderer;