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
    temperature: 0.2,
});

const MAX_CONCURRENCY = 3;

const modelOutputSchema = {
    type: 'object',
    properties: {
        verification_status: {
            type: 'string',
            description: 'The statement verification status. One of Supported, Unsupported, Unverified.',
        },
        verification_explanation: {
            type: 'string',
            description: 'A brief explanation of the reasoning behind the verification status.',
        },
    },
    required: ['verification_status', 'verification_explanation'],
    additionalProperties: false,
};

const structuredModel = model.withStructuredOutput(modelOutputSchema, {
    name: 'statement_verification_output',
    method: 'functionCalling',
    strict: false,
});

const StatementVerificationState = Annotation.Root({
    unverifiedStatements: Annotation(),
    verifiedStatements: Annotation({
        reducer: (left, right) => {
            const leftList = Array.isArray(left) ? left : [];
            const rightList = Array.isArray(right) ? right : [];
            return [...leftList, ...rightList];
        },
        default: () => [],
    }),
    references: Annotation(),
    onVerification: Annotation(),
});

// Input: graph state with unverifiedStatements, references, onVerification.
// Output: list of Send instructions, one per statement.
// Purpose: fan-out work so each statement is verified independently and in parallel.
const fanOutStatementVerificationNode = (state) => {
    const statements = Array.isArray(state?.unverifiedStatements) ? state.unverifiedStatements : [];

    return statements.map((statement) =>
        new Send('statement_verification_node', {
            statement,
            references: state?.references ?? {},
            onVerification: state?.onVerification,
        })
    );
};

// Input: error object and a fallback wait time in seconds.
// Output: integer seconds to wait before retrying.
// Purpose: respect provider backoff hints to avoid rapid retry loops.
const extractRetryAfterSeconds = (err, defaultSeconds = 20) => {
    const message = String(err?.message ?? err ?? '');
    const match = message.match(/Please try again in\s+([0-9.]+)s/i);
    if (!match) {
        return defaultSeconds;
    }

    const parsed = Number.parseFloat(match[1]);
    if (!Number.isFinite(parsed)) {
        return defaultSeconds;
    }

    return Math.max(1, Math.min(Math.floor(parsed) + 1, 120));
};

// Input: error object from model invocation.
// Output: boolean indicating rate-limit detection.
// Purpose: identify errors that are safe to retry with backoff.
const isRateLimitError = (err) => {
    if (!err) return false;
    if (err?.status === 429 || err?.statusCode === 429) return true;
    if (typeof err?.code === 'string' && err.code.toLowerCase().includes('rate')) return true;
    const message = String(err?.message ?? '');
    return /rate limit/i.test(message);
};

// Input: milliseconds to wait.
// Output: Promise that resolves after the delay.
// Purpose: pause execution before retrying a rate-limited request.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Input: model verification status string.
// Output: UI-friendly verification_result string used across the frontend.
// Purpose: align model output (Unsupported) with UI display (Contradicted).
const mapStatusToResult = (status) => {
    if (status === 'Unsupported') {
        return 'Contradicted';
    }

    if (status === 'Supported' || status === 'Unverified') {
        return status;
    }

    return 'Unverified';
};

// Input: substate with a single statement, reference map, and optional callback.
// Output: partial state with verifiedStatements containing the updated statement.
// Purpose: verify a claim using open-access references and emit streaming updates.
const statementVerificationNode = async (state) => {
    const onVerification = typeof state?.onVerification === 'function' ? state.onVerification : null;
    const statement = state?.statement ?? null;
    const references = state?.references ?? {};

    if (!statement) {
        return { verifiedStatements: [] };
    }

    const citationIds = Array.isArray(statement?.citations) ? statement.citations : [];
    const referenceList = citationIds
        .map((refId) => references?.[refId] ?? references?.[String(refId)])
        .filter(Boolean);
    const openAccessReferences = referenceList.filter((ref) => Boolean(ref?.is_open_access));

    if (openAccessReferences.length === 0) {
        statement.verification_result = 'Unverified';
        statement.verification_explanation =
            'None of the cited references are open access, so we cannot verify this statement.';

        onVerification?.({
            event: 'statement_verified',
            sentence_id: statement?.sentence?.id ?? statement?.sentence_id ?? null,
            verification_status: 'Unverified',
            verification_result: statement.verification_result,
            verification_explanation: statement.verification_explanation,
            statement,
        });

        return { verifiedStatements: [statement] };
    }

    const prompt = `
You are an expert at verifying scientific claims by analyzing the cited references.
Here is the scientific claim you need to verify:
${statement?.claim ?? ''}

Here is the content of the cited references: ${openAccessReferences
        .map((ref) => {
            const content = typeof ref?.content === 'string' && ref.content.trim() ? ref.content : 'Content not available';
            return `Reference ${ref?.ref_id ?? 'unknown'}:\nTitle: ${ref?.title ?? 'Untitled'}\nContent: ${content}`;
        })
        .join('\n\n')}

Rules:
- If the content of the cited references clearly supports the claim, then the verification status is "Supported".
- If the content of the cited references clearly contradicts the claim, then the verification status is "Unsupported".
- If the content of the cited references does not provide clear evidence to support or contradict the claim, then the verification status is "Unverified".
- Provide a brief explanation of the reasoning behind the verification status, based on the content of the cited references.
`;

    let result;
    try {
        result = await structuredModel.invoke(prompt);
    } catch (error) {
        if (isRateLimitError(error)) {
            const waitSeconds = extractRetryAfterSeconds(error, 20);
            console.warn(
                `[sentence ${statement?.sentence?.id ?? statement?.sentence_id ?? 'unknown'}] rate-limited; sleeping ${waitSeconds}s before retry`
            );
            await sleep(waitSeconds * 1000);
        }

        throw error;
    }

    const verificationStatus = typeof result?.verification_status === 'string'
        ? result.verification_status
        : 'Unverified';
    const verificationExplanation = typeof result?.verification_explanation === 'string'
        ? result.verification_explanation
        : 'Verification not yet performed.';
    const verificationResult = mapStatusToResult(verificationStatus);

    statement.verification_result = verificationResult;
    statement.verification_explanation = verificationExplanation;

    onVerification?.({
        event: 'statement_verified',
        sentence_id: statement?.sentence?.id ?? statement?.sentence_id ?? null,
        verification_status: verificationStatus,
        verification_result: verificationResult,
        verification_explanation: verificationExplanation,
        statement,
    });

    return { verifiedStatements: [statement] };
};

const statementVerificationGraph = new StateGraph(StatementVerificationState)
    .addNode('statement_verification_node', statementVerificationNode, {
        retryPolicy: {
            maxAttempts: 5,
            retryOn: isRateLimitError,
        },
    })
    .addConditionalEdges(START, fanOutStatementVerificationNode)
    .addEdge('statement_verification_node', END)
    .compile();

// Input: references as array, Map, or object keyed by ref_id.
// Output: plain object map of ref_id -> reference.
// Purpose: normalize reference lookup for consistent access by citation id.
const buildReferenceMap = (references) => {
    if (!references) return {};

    if (Array.isArray(references)) {
        return references.reduce((acc, ref) => {
            const refId = Number.isFinite(Number(ref?.ref_id)) ? Number(ref.ref_id) : null;
            if (refId !== null) {
                acc[refId] = ref;
            }
            return acc;
        }, {});
    }

    if (references instanceof Map) {
        const obj = {};
        for (const [key, value] of references.entries()) {
            obj[key] = value;
        }
        return obj;
    }

    if (typeof references === 'object') {
        return references;
    }

    return {};
};

// Input: statements array, references (array/Map/object), and options.
// Output: array of verified statements from the final graph state.
// Purpose: orchestrate the graph run with concurrency limits and streaming hooks.
export async function runStatementVerificationGraph(statements, references, options = {}) {
    const unverifiedStatements = Array.isArray(statements) ? statements : [];
    if (unverifiedStatements.length === 0) {
        console.warn('[statements] No statements available for verification.');
        return [];
    }

    const onVerification = typeof options?.onVerification === 'function' ? options.onVerification : null;
    const maxConcurrency = Number.isInteger(options?.maxConcurrency)
        ? options.maxConcurrency
        : MAX_CONCURRENCY;

    const finalState = await statementVerificationGraph.invoke(
        {
            unverifiedStatements,
            verifiedStatements: [],
            references: buildReferenceMap(references),
            onVerification: (payload) => {
                if (payload?.event === 'statement_verified') {
                    console.log(
                        `[sentence ${payload?.sentence_id ?? 'unknown'}] verification status: ${payload?.verification_status ?? 'Unverified'} | explanation: ${payload?.verification_explanation ?? ''}`
                    );
                }

                onVerification?.(payload);
            },
        },
        {
            maxConcurrency,
        }
    );

    const verifiedStatements = Array.isArray(finalState?.verifiedStatements)
        ? finalState.verifiedStatements
        : [];
    console.log(`[statements] Total verified: ${verifiedStatements.length}`);
    return verifiedStatements;
}