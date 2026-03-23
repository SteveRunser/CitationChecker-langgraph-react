import { useEffect, useState } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import { getDocument } from 'pdfjs-dist';
import sbd from 'sbd';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';

const getRandomColor = (sentenceId) => {

  const colorId = sentenceId % 4;
  const hue = 80 * colorId;
  return `hsla(${hue}, 85%, 55%, 0.35)`;
};


// The pdf text is broken into text token, with an x, y, width and height coordinates
// as well as a string of the token content. This function extracts the text tokens
// and return them in an array
const extractPdfTextTokens = async (pdfFilePath) => {
  try {

    // Read the PDF
    const loadingTask = getDocument(pdfFilePath);
    const pdf = await loadingTask.promise;
    const textTokens = [];

    // Loop over the pdf pages
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      let pageText = '';

      // Extract each token from the text, and store it's start and end position
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

        textTokens.push({
          start: tokenStart,
          end: tokenEnd,
          left,
          top,
          width: normalizedWidth,
          height: normalizedHeight,
          text: item.str,
          separator,
          pageIndex: pageNumber - 1,
        });
      });
    }
    return textTokens;
  }
   catch (error) {
    console.error('Error during the text token extraction', error);
  } 
};


// Now that the text tokens have been extracted from the text, algorithmically
// try to regroup the tokens that belong to the same sentence. 
const algorithmicSentenceSegmentation = async (rawTextTokens) => {
  const segmentedTextTokens = [];
  try {
    const pageIndexes = [...new Set(rawTextTokens.map((token) => token.pageIndex))].sort((a, b) => a - b);

    pageIndexes.forEach((pageIndex) => {
      const pageTokens = rawTextTokens.filter((token) => token.pageIndex === pageIndex);
      if (!pageTokens.length) {
        return;
      }

      // Rebuild page text using the same separators used during token extraction,
      // so sentence offsets line up with token start/end indices.
      const pageText = pageTokens
        .map((token) => `${token.text}${token.separator ?? ' '}`)
        .join('');

      const sentences = sbd.sentences(pageText, {
        newline_boundaries: false,
        html_boundaries: false,
        sanitize: false,
        preserve_whitespace: true,
        allowed_tags: false,
      });

      let cursor = 0;
      let tokenCursor = 0;
      sentences.forEach((sentence, sentenceId) => {
        const sentenceStart = cursor;
        const sentenceEnd = sentenceStart + sentence.length;
        cursor = sentenceEnd;

        const finalizedSentence = sentence.trim();
        if (!finalizedSentence) {
          return;
        }

        while (
          tokenCursor < pageTokens.length &&
          pageTokens[tokenCursor].end <= sentenceStart
        ) {
          tokenCursor += 1;
        }

        const sentenceTokenIndexes = [];
        let scanIndex = tokenCursor;

        while (
          scanIndex < pageTokens.length &&
          pageTokens[scanIndex].start < sentenceEnd
        ) {
          sentenceTokenIndexes.push(scanIndex);
          if (pageTokens[scanIndex].end > sentenceEnd) {
            break;
          }
          scanIndex += 1;
        }

        const clippedTextToken = sentenceTokenIndexes.map((index) => {
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
            ...token,
            left: token.left + token.width * startRatio,
            width: token.width * widthRatio,
          };
        }).filter(Boolean);

        if (!clippedTextToken.length) {
          return;
        }

        const lastIndex = sentenceTokenIndexes[sentenceTokenIndexes.length - 1];
        if (typeof lastIndex === 'number') {
          tokenCursor = pageTokens[lastIndex].end > sentenceEnd ? lastIndex : lastIndex + 1;
        }

        const color = getRandomColor(sentenceId);
        clippedTextToken.forEach((token, tokenIndex) => {
          segmentedTextTokens.push({
            ...token,
            id: `${pageIndex}-${sentenceId}-${tokenIndex}-${segmentedTextTokens.length}`,
            sentence: finalizedSentence,
            sentenceId,
            color,
          });
        });
      });
    });
  
    return segmentedTextTokens;

  } catch (error) {
    console.error('Failed to extract sentence highlights:', error);
  }
};


function PdfRenderer({ pdfFilePath }) {
  const [textTokens, setTextTokens] = useState([]);

  // Trigers after first render, and also each time the pdfPath is modified
  useEffect(() => {
    if (!pdfFilePath) return;

    let isMounted = true;

    const loadAndSegmentPdf = async () => {
      // Extract the raw text tokens with their positions from the PDF
      const rawTextTokens = await extractPdfTextTokens(pdfFilePath);

      // For each token, we now know to which sentence it belongs. Some errors are possible
      // the segmentation will be refined with an LLM in the next step
      const segmentedTextTokens = await algorithmicSentenceSegmentation(rawTextTokens ?? []);

      if (isMounted) {
        setTextTokens(segmentedTextTokens ?? []);
      }
    };

    loadAndSegmentPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfFilePath]);

  const highlightPluginInstance = highlightPlugin({
    trigger: Trigger.None,
    renderHighlights: (props) => (
      <>
        {textTokens
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