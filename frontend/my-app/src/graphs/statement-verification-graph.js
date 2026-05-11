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

// Limit the number of concurrent calls to the openAI api
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
    statements: Annotation(),
    references: Annotation(),
    onVerification: Annotation(),
});

// Input: graph state with unverifiedStatements, references, onVerification.
// Output: list of Send instructions, one per statement.
// Purpose: fan-out work so each statement is verified independently and in parallel.
const fanOutStatementVerificationNode = (state) => {
 
    return  Array.from(state.statements.entries()).map(([statementId, statement]) =>
        new Send('statement_verification_node', {
            statement,
            references: state.references,
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
    if (!statement || !references) {return null;}

    // Collect the cited references in the statement
    const citationIds = Array.isArray(statement?.citations) ? statement.citations : [];

    // Get the open access references that have content available for verification. 
    const openAccessReferences = citationIds
        .map(id => references.get(id) ?? references.get(String(id)))
        .filter(ref => Boolean(ref?.is_open_access && ref?.content?.trim()));

    // If no citation is open access, we cannot verify the claim, so we mark it as Unverified with an explanation.
    if (openAccessReferences.length === 0) {
        statement.verification_result = 'Unverified';
        statement.verification_explanation =
            'None of the cited references are open access, so we cannot verify this statement.';

        onVerification?.({
            ...statement,
            verification_result: statement.verification_result,
            verification_explanation: statement.verification_explanation,
        });

        return null;
    }

    // If the claim can be verified, construct a prompt where the cited papers are in 
    // the context.
    const prompt = `
You are an expert at verifying scientific claims by analyzing the cited references.
Here is the scientific claim you need to verify:
${statement?.claim ?? ''}

Here is the content of the cited references: ${openAccessReferences
        .map((ref) => {
            return `Reference ${ref?.ref_id ?? 'unknown'}:\nTitle: ${ref?.title ?? 'Untitled'}\nContent: ${ref?.content ?? 'No content available.'}`;
        })
        .join('\n\n')}

Rules:
- If the content of the cited references clearly supports the claim, then the verification status is "Supported".
- If the content of the cited references clearly contradicts the claim, then the verification status is "Unsupported".
- If the content of the cited references does not provide clear evidence to support or contradict the claim, then the verification status is "Unverified".
- Provide a brief explanation of the reasoning behind the verification status, based on the content of the cited references.
`;

    // Use a smart retry and backoff logic to handle API rate limits
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

    // Stream the verification result back to the UI via the onVerification callback, and also return it in the node output for accumulation in the graph state.
    statement.verification_result = verificationResult;
    statement.verification_explanation = verificationExplanation;
    onVerification?.({
        ...statement,
        verification_result: statement.verification_result,
        verification_explanation: statement.verification_explanation,
    });

    return null;
};




// Input: statements array, references (array/Map/object), and options.
// Output: array of verified statements from the final graph state.
// Purpose: orchestrate the graph run with concurrency limits and streaming hooks.
async function verifyStatements({statements, references, onVerification}) {

    if (statements.size === 0) {
        throw new Error('No statements to verify');
    }
    if (references.size === 0) {
        throw new Error('No references provided for verification');
    }

    // Create the graph with a retry policy on the statement verification node 
    // to handle rate limits gracefully.
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

    const finalState = await statementVerificationGraph.invoke(
        {
            statements: statements,
            references: references,
            onVerification: onVerification,
        },
        {
            MAX_CONCURRENCY,
        }
    );
    return null;
}

export default verifyStatements;