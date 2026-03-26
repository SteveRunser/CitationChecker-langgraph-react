import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import TurndownService from 'turndown';

const openAIProxyBaseUrl = new URL('/openai/v1', window.location.origin).toString();

const model = new ChatOpenAI({
    model: 'gpt-5-nano',
    apiKey: 'proxy-auth',
    configuration: {
        baseURL: openAIProxyBaseUrl,
    },
    dangerouslyAllowBrowser: true,
});

const CROSSREF_API_URL = 'https://api.crossref.org/works';
const UNPAYWALL_API_BASE = 'https://api.unpaywall.org/v2';
const UNPAYWALL_EMAIL = (import.meta.env.VITE_UNPAYWALL_EMAIL ?? '').trim();
const PAPER_FETCH_PROXY_URL = '/paper-fetch';
const turndownService = new TurndownService({ headingStyle: 'atx' });

const cleanString = (value) => (typeof value === 'string' ? value.trim() : '');

const htmlToMarkdown = (html) => {
    if (!html || typeof html !== 'string') {
        return '';
    }

    return cleanString(turndownService.turndown(html));
};

const fetchCrossrefMetadata = async (reference) => {
    const title = cleanString(reference?.title);
    if (!title) {
        return reference;
    }

    const params = new URLSearchParams({
        'query.title': title,
        rows: '5',
    });

    if (Number.isFinite(Number(reference?.publication_year))) {
        const year = Number(reference.publication_year);
        params.set('filter', `from-pub-date:${year}-01-01,until-pub-date:${year}-12-31`);
    }

    const response = await fetch(`${CROSSREF_API_URL}?${params.toString()}`);
    if (!response.ok) {
        return reference;
    }

    const payload = await response.json();
    const item = payload?.message?.items?.[0];

    if (!item) {
        return reference;
    }

    const containerTitle = item?.['container-title'];
    const journal = Array.isArray(containerTitle)
        ? cleanString(containerTitle[0]) || cleanString(reference?.journal)
        : cleanString(containerTitle) || cleanString(reference?.journal);

    const authors = Array.isArray(item?.author)
        ? item.author
            .map((author) => `${cleanString(author?.given)} ${cleanString(author?.family)}`.trim())
            .filter(Boolean)
        : [];

    return {
        ...reference,
        html_url: cleanString(item?.URL) || reference?.html_url || null,
        doi: cleanString(item?.DOI) || reference?.doi || null,
        journal: journal || reference?.journal || '',
        authors: authors.length > 0 ? authors : reference?.authors ?? null,
    };
};

const fetchOpenAccessMetadata = async (reference) => {
    const doi = cleanString(reference?.doi);
    if (!doi || !UNPAYWALL_EMAIL) {
        return reference;
    }

    const response = await fetch(`${UNPAYWALL_API_BASE}/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`);
    if (!response.ok) {
        return reference;
    }

    const payload = await response.json();
    const isOpenAccess = Boolean(payload?.is_oa);
    const bestLocation = payload?.best_oa_location ?? {};

    return {
        ...reference,
        is_open_access: isOpenAccess,
        pdf_url: isOpenAccess ? cleanString(bestLocation?.url_for_pdf) || reference?.pdf_url || null : reference?.pdf_url ?? null,
        html_url: isOpenAccess ? cleanString(bestLocation?.url_for_landing_page) || reference?.html_url || null : reference?.html_url ?? null,
    };
};

const fetchPaperContent = async (reference) => {
    if (!reference?.is_open_access) {
        return reference;
    }

    if (cleanString(reference?.content).length > 5000) {
        return reference;
    }

    const htmlUrl = cleanString(reference?.html_url);
    if (!htmlUrl) {
        return reference;
    }

    const proxyUrl = `${PAPER_FETCH_PROXY_URL}?url=${encodeURIComponent(htmlUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        return reference;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
        return reference;
    }

    const html = await response.text();
    const markdown = htmlToMarkdown(html);
    if (markdown.length <= 5000) {
        return reference;
    }

    return {
        ...reference,
        content: markdown,
    };
};

const fetchReferenceMetadataOnline = async (reference) => {
    try {
        let enrichedReference = { ...reference };
        enrichedReference = await fetchCrossrefMetadata(enrichedReference);
        enrichedReference = await fetchOpenAccessMetadata(enrichedReference);
        enrichedReference = await fetchPaperContent(enrichedReference);
        return enrichedReference;
    } catch (error) {
        console.warn('[references] Metadata enrichment failed', reference?.ref_id, error);
        return reference;
    }
};

const ReferenceExtractionState = Annotation.Root({
    document: Annotation(),
    references: Annotation({
        reducer: (left, right) => {
            const leftList = Array.isArray(left) ? left : [];
            const rightList = Array.isArray(right) ? right : [];
            const seen = new Set();
            const merged = [];

            for (const ref of [...leftList, ...rightList]) {
                const key = `${ref?.ref_id ?? ''}::${(ref?.title ?? '').trim().toLowerCase()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(ref);
                }
            }

            return merged;
        },
        default: () => [],
    }),
    onReference: Annotation(),
});

const normalizeReference = (value) => ({
    ref_id: Number.isFinite(Number(value?.ref_id)) ? Number(value.ref_id) : null,
    journal: typeof value?.journal === 'string' ? value.journal : '',
    title: typeof value?.title === 'string' ? value.title : '',
    authors: Array.isArray(value?.authors) ? value.authors : null,
    publication_year: Number.isFinite(Number(value?.publication_year)) ? Number(value.publication_year) : null,
    doi: typeof value?.doi === 'string' ? value.doi : null,
    is_open_access: Boolean(value?.is_open_access),
    pdf_url: typeof value?.pdf_url === 'string' ? value.pdf_url : null,
    html_url: typeof value?.html_url === 'string' ? value.html_url : null,
    content: typeof value?.content === 'string' ? value.content : '',
});

const referenceExtractionNode = async (state) => {
    const document = state.document ?? '';
    const onReference = typeof state.onReference === 'function' ? state.onReference : null;
    const references = [];
    const seen = new Set();

    const systemPrompt = `You are an expert at analyzing references in scientific articles.
Find all references in the bibliography section.

Output format (strict):
- Output one JSON object per line (JSONL)
- No markdown
- No commentary
- No surrounding array

Each JSON object must follow:
{
    "ref_id": int,
    "journal": str,
    "title": str,
    "authors": [str] | null,
    "publication_year": int | null,
    "doi": str | null
}`;

    const stream = await model.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(document),
    ]);

    let buffer = '';

    const emitLine = async (line) => {
        const trimmed = line.trim().replace(/,$/, '');
        if (!trimmed) return;

        try {
            const parsed = JSON.parse(trimmed);
            const reference = normalizeReference(parsed);
            if (reference.ref_id === null || !reference.title) return;

            const key = `${reference.ref_id}::${reference.title.trim().toLowerCase()}`;
            if (seen.has(key)) return;

            seen.add(key);
            const enrichedReference = normalizeReference(await fetchReferenceMetadataOnline(reference));
            references.push(enrichedReference);
            onReference?.(enrichedReference, references.length);
        } catch {
            // Ignore non-JSON lines while streaming.
        }
    };

    for await (const chunk of stream) {
        const content = typeof chunk.content === 'string' ? chunk.content : '';
        if (!content) continue;

        buffer += content;
        while (buffer.includes('\n')) {
            const newlineIndex = buffer.indexOf('\n');
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            await emitLine(line);
        }
    }

    await emitLine(buffer);
    return { references };
};

const builder = new StateGraph(ReferenceExtractionState)
    .addNode('reference_extraction_node', referenceExtractionNode)
    .addEdge(START, 'reference_extraction_node')
    .addEdge('reference_extraction_node', END);

const graph = builder.compile();

const sentenceAreasToFullText = (sentenceAreas) => {
    const sentenceMap = new Map();
    for (const token of sentenceAreas ?? []) {
        if (token?.sentenceId === undefined || typeof token?.sentence !== 'string') {
            continue;
        }
        if (!sentenceMap.has(token.sentenceId)) {
            sentenceMap.set(token.sentenceId, token.sentence.replace(/\n/g, ' '));
        }
    }

    return [...sentenceMap.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, sentence]) => sentence)
        .join('\n');
};

export async function runReferenceExtractionGraph(sentenceAreas, options = {}) {
    const fullText = sentenceAreasToFullText(sentenceAreas);
    if (!fullText.trim()) {
        console.warn('[references] No sentence data available for extraction.');
        return [];
    }

    const onReference = typeof options?.onReference === 'function' ? options.onReference : null;

    const initialState = {
        document: fullText,
        references: [],
        onReference: (reference, count) => {
            console.log(`[reference ${count}] id=${reference.ref_id} | ${reference.title}`);
            onReference?.(reference, count);
        },
    };

    const finalState = await graph.invoke(initialState);
    const references = finalState?.references ?? [];
    console.log(`[references] Total extracted: ${references.length}`);
    return references;
}