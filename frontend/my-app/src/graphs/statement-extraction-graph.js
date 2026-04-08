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
    const onStatement = typeof state?.onStatement === 'function' ? state.onStatement : null;

    const sentence = state?.sentence;
    const sentences = state?.sentences ?? {};

    // Extract the previous, current, and next sentences for context, ensuring they are strings
    const previousSentenceText = typeof sentences[sentenceId - 1]?.text === 'string' ? sentences[sentenceId - 1].text : '';
    const currentSentenceText = typeof state?.sentence?.text === 'string' ? state.sentence.text : '';
    const nextSentenceText = typeof sentences[sentenceId + 1]?.text === 'string' ? sentences[sentenceId + 1].text : '';
    const surroundingText = `${previousSentenceText} ${currentSentenceText} ${nextSentenceText}`.trim();

    if (!currentSentenceText) {
        return { statements: [] };
    }

    const prompt = `
Given the following sentence:
${currentSentenceText}

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

    // Invoke the model
    const result = await structuredModel.invoke(prompt);

    // Extract the summary of the claim
    const claim = typeof result?.claim === 'string' ? result.claim.trim() : null;

    // Extract the title of the statement
    const title = typeof result?.title === 'string' ? result.title.trim() : '';

    // Extract the citation numbers as an array of integers
    const citations = Array.isArray(result?.citations)
        ? result.citations
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
        : [];

    // If there is no claim or no citations, return nothing for this sentence
    if (!claim || citations.length === 0) {
        return { statements: [] };
    }

    // Construct the statement object
    const statement = {
        claim,
        title,
        sentence: sentence,
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


export async function runStatementExtractionGraph(sentences, options = {}) {
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
                console.log(`[statement] sentence=${statement?.sentence?.id ?? 'unknown'} | ${statement.claim}`);
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
