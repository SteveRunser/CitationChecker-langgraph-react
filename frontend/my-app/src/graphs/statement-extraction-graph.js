import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph/web';
import { ChatOpenAI } from '@langchain/openai';

const openAIProxyBaseUrl = new URL('/openai/v1', window.location.origin).toString();

const model = new ChatOpenAI({
    model: 'gpt-5-nano',
    apiKey: 'proxy-auth',
    configuration: {
        baseURL: openAIProxyBaseUrl,
    },
    dangerouslyAllowBrowser: true,
});

const MAX_CONCURRENCY = 20;

const modelOutputSchema = {
    type: 'object',
    properties: {
        title: {
            type: 'string',
            description: 'A small title for the claim, ideally less than 5 words.',
        },
        claim: {
            type: 'string',
            description: 'One sentence summary of the scientific claim. Empty string if no claim.',
        },
        citations: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Citation numbers associated with the claim.',
        },
    },
    required: ['claim', 'citations', 'title'],
    additionalProperties: false,
};

const structuredModel = model.withStructuredOutput(modelOutputSchema, {
    name: 'statement_extraction_output',
    method: 'functionCalling',
    strict: false,
});

const StatementExtractionState = Annotation.Root({
    sentences: Annotation(),
    statements: Annotation({
        reducer: (left, right) => {
            const leftList = Array.isArray(left) ? left : [];
            const rightList = Array.isArray(right) ? right : [];
            return [...leftList, ...rightList];
        },
        default: () => [],
    }),
    onStatement: Annotation(),
});

const fanOutStatementExtractionNode = (state) => {
    const sentences = state?.sentences ?? {};

    return Object.entries(sentences).map(([sentenceId, sentence]) =>
        new Send('statement_extraction_node', {
            sentence_id: Number(sentenceId),
            sentence,
            sentences,
            onStatement: state?.onStatement,
        })
    );
};

const statementExtractionNode = async (state) => {
    const sentenceId = Number(state?.sentence_id);
    const sentence = typeof state?.sentence === 'string' ? state.sentence : '';
    const sentences = state?.sentences ?? {};
    const onStatement = typeof state?.onStatement === 'function' ? state.onStatement : null;

    if (!sentence) {
        return { statements: [] };
    }

    const previousSentence = typeof sentences[sentenceId - 1] === 'string' ? sentences[sentenceId - 1] : '';
    const nextSentence = typeof sentences[sentenceId + 1] === 'string' ? sentences[sentenceId + 1] : '';
    const surroundingText = `${previousSentence} ${sentence} ${nextSentence}`.trim();

    const prompt = `
Given the following sentence:
${sentence}

If this sentence contains a scientific statement supported by one or several citations,
extract its associated citations and make a one-line summary of the claim being made.
Do not use pronouns as the subject. The summary should be understandable on its own.
Here is surrounding context:
${surroundingText}

Rules:
- if the sentence contains no citation, return claim="" and citations=[]
- if there is a scientific claim, write a one sentence summary of the claim
- only include claims that have at least one citation number
- preserve exact citation numbers from the text
- do not invent citations
- do not include brackets or parentheses around citation numbers
- no markdown
- no numbering
`;

    const result = await structuredModel.invoke(prompt);

    const claim = typeof result?.claim === 'string' ? result.claim.trim() : null;
    const citations = Array.isArray(result?.citations)
        ? result.citations
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        : [];

    const title = typeof result?.title === 'string' ? result.title.trim() : '';

    if (!claim || citations.length === 0) {
        return { statements: [] };
    }

    const statement = {
        claim,
        title,
        sentence_id: sentenceId,
        citations,
        verification_result: 'Unverified',
    };

    onStatement?.(statement);
    return { statements: [statement] };
};

const statementExtractionGraph = new StateGraph(StatementExtractionState)
    .addNode('statement_extraction_node', statementExtractionNode)
    .addConditionalEdges(START, fanOutStatementExtractionNode)
    .addEdge('statement_extraction_node', END)
    .compile();

const sentenceAreasToSentences = (sentenceAreas) => {
    const sentenceMap = new Map();

    for (const token of sentenceAreas ?? []) {
        if (token?.sentenceId === undefined || typeof token?.sentence !== 'string') {
            continue;
        }

        if (!sentenceMap.has(token.sentenceId)) {
            sentenceMap.set(token.sentenceId, token.sentence.replace(/\n/g, ' '));
        }
    }

    return Object.fromEntries(
        [...sentenceMap.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
    );
};

export async function runStatementExtractionGraph(sentenceAreas, options = {}) {
    const sentences = sentenceAreasToSentences(sentenceAreas);
    const sentenceCount = Object.keys(sentences).length;

    if (sentenceCount === 0) {
        console.warn('[statements] No sentence data available for extraction.');
        return [];
    }

    const onStatement = typeof options?.onStatement === 'function' ? options.onStatement : null;
    const maxConcurrency = Number.isInteger(options?.maxConcurrency)
        ? options.maxConcurrency
        : MAX_CONCURRENCY;

    const finalState = await statementExtractionGraph.invoke(
        {
            sentences,
            statements: [],
            onStatement: (statement) => {
                console.log(`[statement] sentence=${statement.sentence_id} | ${statement.claim}`);
                onStatement?.(statement);
            },
        },
        {
            maxConcurrency,
        }
    );

    const statements = Array.isArray(finalState?.statements) ? finalState.statements : [];
    console.log(`[statements] Total extracted: ${statements.length}`);
    return statements;
}
