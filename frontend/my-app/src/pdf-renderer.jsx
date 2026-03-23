import { Viewer, Worker } from '@react-pdf-viewer/core';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';

function PdfRenderer({ pdfFilePath, highlights = [] }) {

  const highlightPluginInstance = highlightPlugin({
    trigger: Trigger.None,
    renderHighlights: (props) => (
      <>
        {highlights
          .filter((area) => area.pageIndex === props.pageIndex)
          .map((area) => (
            <div
              key={area.id}
              title={area.sentence}
              style={{
                ...props.getCssProperties(area, props.rotation),
                background: area.color,
              }}
            />
          ))}
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