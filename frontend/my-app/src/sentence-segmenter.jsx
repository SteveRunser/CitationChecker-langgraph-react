import { useEffect } from 'react';
import { getDocument } from 'pdfjs-dist';
import sbd from 'sbd';



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


// This function takes the raw text tokens and group them into sentences.
// It uses the `sbd` library to perform sentence boundary detection on the text of each page.
const rulebasedSentenceSegmentation = async (rawTextTokens) => {
  
  // Store the segmented sentences in this array.
  const sentences = [];

  // Create a unique ID for each sentence to link it back to the original text tokens.
  let sentenceId = 0;

  try {

    // Create a sorted list of the page indexes that are present in the raw text tokens. 
    // This will allow us to process the text tokens page by page.
    const pageIndexes = [...new Set(rawTextTokens.map((token) => token.pageIndex))].sort((a, b) => a - b);

    // Loop over the pages and perform sentence segmentation on the text of each page.
    pageIndexes.forEach((pageIndex) => {

    // Select all the text tokens that belong to the current page.
    const pageTokens = rawTextTokens.filter((token) => token.pageIndex === pageIndex);
    if (!pageTokens.length) {
      return;
    }

    // Reconstruct the text of the page by concatenating the text of the tokens.
    const pageText = pageTokens
      .map((token) => `${token.text}${token.separator ?? ' '}`)
      .join('');

    // Use sbd to split the text of the page into sentences. 
    const segmentedSentences = sbd.sentences(pageText, {
      newline_boundaries: false,
      html_boundaries: false,
      sanitize: false,
      preserve_whitespace: true,
      allowed_tags: false,
    });

    // For each sentences, we determine which tokens belong to the sentence. When a text token overlaps with two 
    // sentences, we create a clipped text token that only contains the part of the text that belongs to the sentence.
    let cursor = 0; // This cursor will keep track of our position in the page text as we loop over the sentences.
    let tokenCursor = 0; // This cursor will keep track of our position in the page tokens as we loop over the sentences.

    // Loop over the segmented sentences, that are just text strings, and link them back to the text tokens that constitute them. This will allow us to link the sentences back to the original PDF text and position.
    segmentedSentences.forEach((segmentedSentence) => {

      // Find the start and end position of the sentence in the page text.
      const sentenceStart = cursor;
      const sentenceEnd = sentenceStart + segmentedSentence.length;
      cursor = sentenceEnd;

      const finalizedSentence = segmentedSentence.trim();
      if (!finalizedSentence) {
        return;
      }

      // Move the token cursor to the first token that overlaps with the sentence.
      while (
        tokenCursor < pageTokens.length &&
        pageTokens[tokenCursor].end <= sentenceStart
      ) {
        tokenCursor += 1;
      }

      // Store in this list a copy of the tokens that belong to the sentence.
      const sentenceTokens = [];

      // Loop over the tokens that overlap with the sentence and add them to the sentence token list. 
      let scanIndex = tokenCursor;
      while (
        scanIndex < pageTokens.length &&
        pageTokens[scanIndex].start < sentenceEnd
      ) {
        
        // Store the text token that overlap with the sentence.
        sentenceTokens.push(pageTokens[scanIndex]);

        // If the current token ends after the end of the sentence.
        if (pageTokens[scanIndex].end > sentenceEnd) {
          break;
        }
        scanIndex += 1;
      }

      // The first and the last token of the sentence may overlap with the previous and the next sentences.
      // For this reason, we create clipped text tokens that only contain the part of the text that belongs to the sentence.
      const sentenceTokenClipped = sentenceTokens
        .map((token) => {
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

      // Create the sentence object.
      sentences.push({
        id: sentenceId,
        text: finalizedSentence,
        tokens: sentenceTokenClipped,
      });

      sentenceId += 1;
    });
  });

    return sentences;
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

        // The text tokens are the raw bits of text that have been extracted from the PDF. 
        // Here are the following properties of the text tokens:
        // - start: the index of the first character of the token in the page text
        // - end: the index of the last character of the token in the page text
        // - left: the left position of the token in percentage of the page width
        // - top: the top position of the token in percentage of the page height
        // - width: the width of the token in percentage of the page width
        // - height: the height of the token in percentage of the page height
        // - text: the actual text content of the token
        // - separator: the separator that follows the token (e.g., space, newline)
        // - pageIndex: the index of the page where the token is located (starting from 0)
        const rawTextTokens = await extractPdfTextTokens(pdfFilePath);

        // Extract sentences from the raw text tokens. 
        const sentences = await rulebasedSentenceSegmentation(rawTextTokens ?? []);

        if (isMounted) {
          onComplete?.(sentences ?? []);
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
