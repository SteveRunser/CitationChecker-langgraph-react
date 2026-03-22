import { useEffect, useState } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import { getDocument } from 'pdfjs-dist';
import sbd from 'sbd';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';

const getRandomColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsla(${hue}, 85%, 55%, 0.35)`;
};

function PdfRenderer({ pdfFilePath }) {
  const [sentenceAreas, setSentenceAreas] = useState([]);

  useEffect(() => {
    let isCancelled = false;

    const extractSentenceAreas = async () => {
      try {
        const loadingTask = getDocument(pdfFilePath);
        const pdf = await loadingTask.promise;
        const computedAreas = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const textContent = await page.getTextContent();

          const pageTokens = [];
          let pageText = '';

          textContent.items.forEach((item) => {
            const transform = item.transform || [0, 0, 0, 0, 0, 0];
            const x = transform[4] || 0;
            const y = transform[5] || 0;
            const width = item.width || 0;
            const height = Math.abs(transform[3]) || item.height || 0;

            if (!item.str || width <= 0 || height <= 0) {
              return;
            }

            const left = (x / viewport.width) * 100;
            const top = ((viewport.height - y - height) / viewport.height) * 100;
            const normalizedWidth = (width / viewport.width) * 100;
            const normalizedHeight = (height / viewport.height) * 100;

            const separator = item.hasEOL ? '\n' : ' ';
            const tokenStart = pageText.length;
            pageText += item.str;
            const tokenEnd = pageText.length;
            pageText += separator;

            pageTokens.push({
              start: tokenStart,
              end: tokenEnd,
              left,
              top,
              width: normalizedWidth,
              height: normalizedHeight,
              text: item.str,
            });
          });

          const sentences = sbd.sentences(pageText, {
            newline_boundaries: false,
            html_boundaries: false,
            sanitize: false,
            preserve_whitespace: true,
            allowed_tags: false,
          });

      

          let cursor = 0;

          sentences.forEach((sentence) => {
            const sentenceStart = cursor;
            const sentenceEnd = sentenceStart + sentence.length;
            cursor = sentenceEnd;

            const finalizedSentence = sentence.trim();
            if (!finalizedSentence) {
              return;
            }

            const sentenceTokenIndexes = pageTokens
              .map((token, index) => ({ token, index }))
              .filter(
                ({ token }) =>
                  token.end > sentenceStart &&
                  token.start < sentenceEnd
              )
              .map(({ index }) => index);

            const sentenceTokenBoxes = sentenceTokenIndexes
              .map((index) => {
                const token = pageTokens[index];
                const overlapStart = Math.max(token.start, sentenceStart);
                const overlapEnd = Math.min(token.end, sentenceEnd);
                const tokenLength = token.end - token.start;
                const overlapLength = overlapEnd - overlapStart;

                if (tokenLength <= 0 || overlapLength <= 0) {
                  return null;
                }

                const startRatio = (overlapStart - token.start) / tokenLength;
                const widthRatio = overlapLength / tokenLength;

                return {
                  left: token.left + token.width * startRatio,
                  top: token.top,
                  width: token.width * widthRatio,
                  height: token.height,
                };
              })
              .filter(Boolean);

            if (!sentenceTokenBoxes.length) {
              return;
            }

            console.log('[DetectedSentence]', {
              pageNumber,
              sentence: finalizedSentence,
            });

            const color = getRandomColor();
            sentenceTokenBoxes.forEach((box) => {
              computedAreas.push({
                id: `${pageNumber}-${computedAreas.length}`,
                pageIndex: pageNumber - 1,
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                color,
                sentence: finalizedSentence,
              });
            });
          });
        }

        if (!isCancelled) {
          setSentenceAreas(computedAreas);
        }
      } catch (error) {
        console.error('Failed to extract sentence highlights:', error);
      }
    };

    if (pdfFilePath) {
      extractSentenceAreas();
    }

    return () => {
      isCancelled = true;
    };
  }, [pdfFilePath]);

  const highlightPluginInstance = highlightPlugin({
    trigger: Trigger.None,
    renderHighlights: (props) => (
      <>
        {sentenceAreas
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