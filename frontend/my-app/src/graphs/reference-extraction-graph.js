import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const model = new ChatOpenAI({
    model: 'gpt-5-nano',
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
});

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

    const emitLine = (line) => {
        const trimmed = line.trim().replace(/,$/, '');
        if (!trimmed) return;

        try {
            const parsed = JSON.parse(trimmed);
            const reference = normalizeReference(parsed);
            if (reference.ref_id === null || !reference.title) return;

            const key = `${reference.ref_id}::${reference.title.trim().toLowerCase()}`;
            if (seen.has(key)) return;

            seen.add(key);
            references.push(reference);
            onReference?.(reference, references.length);
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
            emitLine(line);
        }
    }

    emitLine(buffer);
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

export async function runReferenceExtractionGraph(sentenceAreas) {
    const fullText = sentenceAreasToFullText(sentenceAreas);
    if (!fullText.trim()) {
        console.warn('[references] No sentence data available for extraction.');
        return [];
    }

    const initialState = {
        document: fullText,
        references: [],
        onReference: (reference, count) => {
            console.log(`[reference ${count}] id=${reference.ref_id} | ${reference.title}`);
        },
    };

    const finalState = await graph.invoke(initialState);
    const references = finalState?.references ?? [];
    console.log(`[references] Total extracted: ${references.length}`);
    return references;
}