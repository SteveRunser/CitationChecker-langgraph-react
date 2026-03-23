import { useEffect } from 'react';
import { getDocument } from 'pdfjs-dist';
import sbd from 'sbd';

const getRandomColor = (sentenceId) => {
  const colorId = sentenceId % 4;
  const hue = 80 * colorId;
  return `hsla(${hue}, 85%, 55%, 0.35)`;
};

const extractPdfTextTokens = async (pdfFilePath) => {
  try {
    const loadingTask = getDocument(pdfFilePath);
    const pdf = await loadingTask.promise;
    const textTokens = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

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
  } catch (error) {
    console.error('Error during text token extraction:', error);
    return [];
  }
};

const algorithmicSentenceSegmentation = async (rawTextTokens) => {
  const segmentedTextTokens = [];

  try {
    const pageIndexes = [...new Set(rawTextTokens.map((token) => token.pageIndex))].sort((a, b) => a - b);

    pageIndexes.forEach((pageIndex) => {
      const pageTokens = rawTextTokens.filter((token) => token.pageIndex === pageIndex);
      if (!pageTokens.length) {
        return;
      }

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

        const clippedTextToken = sentenceTokenIndexes
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
              ...token,
              left: token.left + token.width * startRatio,
              width: token.width * widthRatio,
            };
          })
          .filter(Boolean);

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
    console.error('Failed to segment sentence highlights:', error);
    return [];
  }
};

function SentenceSegmenter({ pdfFilePath, onStart, onComplete, onError }) {
  useEffect(() => {
    if (!pdfFilePath) {
      onComplete?.([]);
      return;
    }

    let isMounted = true;

    const processPdf = async () => {
      try {
        onStart?.();

        const rawTextTokens = await extractPdfTextTokens(pdfFilePath);
        const segmentedTextTokens = await algorithmicSentenceSegmentation(rawTextTokens ?? []);

        if (isMounted) {
          onComplete?.(segmentedTextTokens ?? []);
        }
      } catch (error) {
        console.error('Sentence segmentation pipeline failed:', error);
        if (isMounted) {
          onError?.(error);
          onComplete?.([]);
        }
      }
    };

    processPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfFilePath, onStart, onComplete, onError]);

  return null;
}

export default SentenceSegmenter;
