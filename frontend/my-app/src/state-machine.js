import { createMachine, assign, fromCallback, fromPromise } from "xstate";
import { getDocument } from "pdfjs-dist";


import extractSentences from "./sentence-extraction";
import extractStatements from './graphs/statement-extraction-graph'
import extractReferences from './graphs/reference-extraction-graph'
import verifyStatements from './graphs/statement-verification-graph'

// Use a state machine to manage the transition between the different stages of the pipeline. 
// The first stage of the pipeline is the extraction stage, which runs both the statement and reference 
// extraction graphs in parallel. The second stage is the verification stage, which runs the statement verification graph. If any errors are encountered during extraction or verification, the machine 
// transitions to an error state. To update the UI in real-time each langgraph will send events with the 
// new data as it is extracted or verified. The machine will capture these events and update the context 
// accordingly, which will trigger a re-render of the UI with the new data.

//---------------------------------------------------------------------------------
// Sub-state for the PDF loading stage.
const pdfLoadingStateManagement = (pdfFilePath) => ({
  invoke: {
    src: fromPromise(async () => {
      const loadingTask = getDocument(pdfFilePath);
      const pdf = await loadingTask.promise;
      return pdf;
    }),
    onDone: {
      target: "sentenceExtraction",
      // Pass the pdf forward via the done event; avoid storing it in context.
    },
    onError: {
      target: "#extraction-verification-pipeline.error",
      actions: assign({
        error: ({ event }) => event?.error ?? event?.data ?? event
      }),
    },
  }
});
//---------------------------------------------------------------------------------


//---------------------------------------------------------------------------------
// Sub-state machine for the sentence extraction process
const sentenceExtractionStateManagement = {
  invoke: {
    src: fromPromise(({ input }) => extractSentences({ pdf: input.pdf })),
    input: ({ event }) => ({ pdf: event?.output ?? event?.data }),
    onDone: {
      target: "statementReferenceExtraction",
      actions: assign({
        sentences: ({ event }) => event?.output ?? event?.data
      })
    },
    onError: {
      target: "#extraction-verification-pipeline.error",
      actions: assign({
        error: ({ event }) => event?.error ?? event?.data ?? event
      }),
    }
  }
}
//---------------------------------------------------------------------------------


//---------------------------------------------------------------------------------
// Sub-state machine for the statement extraction process
const statementExtractionStateManagement= {
  initial: "running",
  states: {
    running: {
      invoke: {
        src: fromCallback(({ input, sendBack }) => {
          let isActive = true;

          // We call the extractStatements function and pass a custom callback (onStatement)
          // that will be called by the graph every time a new statement is extracted. This 
          // custom callback then sends an event back to the state machine with the new 
          // statement, which allows us to update the UI in real-time as new 
          // statements are extracted.
          extractStatements({
            sentences: input.sentences,

            // Custom callback function
            onStatement: (statement) => {
              if (isActive) {
                sendBack({ type: "STATEMENT_EXTRACTION_NEW_DATA", statement });
              }
            },
          })
            .then(() => {
              if (isActive) {
                sendBack({ type: "STATEMENT_EXTRACTION_COMPLETE" });
              }
            })
            .catch((error) => {
              if (isActive) {
                sendBack({ type: "STATEMENT_EXTRACTION_ERROR", error });
              }
            });

          return () => {
            isActive = false;
          };
        }),
        input: ({ context }) => ({ sentences: context.sentences }),
      }
    },
    done: { type: "final" }
  },

  // The extractStatements function will send events that are captured by the handlers
  // The different types of events are:
  // - STATEMENT_EXTRACTION_NEW_DATA: A new statement has been extracted. The statement is included in the event payload.
  // - STATEMENT_EXTRACTION_COMPLETE: All statements have been extracted (go to done state). 
  // - ERROR: An error occurred during extraction. The error message is included in the event payload.
  on : {
    STATEMENT_EXTRACTION_NEW_DATA: {
      actions: assign({
        statements: ({ context, event }) => new Map(context.statements).set(event.statement?.sentence?.id, event.statement)
      })
    },

    STATEMENT_EXTRACTION_ERROR: {
      target: "#extraction-verification-pipeline.error",
      actions: assign({
        error: ({ event }) => event?.error ?? event?.data ?? event
      }),
    },

    STATEMENT_EXTRACTION_COMPLETE: {
      target: ".done"
    },
  },
}
//---------------------------------------------------------------------------------


//---------------------------------------------------------------------------------
// Sub-state machine for the reference extract process. The logic is the same as for 
// the statement extraction sub-state machine, but it listens for different events 
// and updates a different part of the context.
const referenceExtractionStateManagement = {
  initial: "running",
  states: {
    running: {
      invoke: {
        src: fromCallback(({ input, sendBack }) => {
          let isActive = true;

          extractReferences({
            sentences: input.sentences,
            onReference: (reference) => {
              if (isActive) {
                sendBack({ type: "REFERENCE_EXTRACTION_NEW_DATA", reference });
              }
            },
          })
            .then(() => {
              if (isActive) {
                sendBack({ type: "REFERENCE_EXTRACTION_COMPLETE" });
              }
            })
            .catch((error) => {
              if (isActive) {
                sendBack({ type: "REFERENCE_EXTRACTION_ERROR", error });
              }
            });

          return () => {
            isActive = false;
          };
        }),
        input: ({ context }) => ({ sentences: context.sentences }),
      },
    },
    done: { type: "final" }
  },

  on : {
    REFERENCE_EXTRACTION_NEW_DATA: {
      actions: assign({
        references: ({ context, event }) => new Map(context.references).set(event.reference.ref_id, event.reference)
      })
    },

    REFERENCE_EXTRACTION_ERROR: {
      target: "#extraction-verification-pipeline.error",
      actions: assign({
        error: ({ event }) => event?.error ?? event?.data ?? event
      }),
    },

    REFERENCE_EXTRACTION_COMPLETE: {
      target: ".done"
    },
  }
}
//---------------------------------------------------------------------------------



//---------------------------------------------------------------------------------
// Sub-state machine for the statement verification process
const statementVerificationStateManagement= {
  initial: "running",
  states: {
    running: {
      invoke: {
        src: fromCallback(({ input, sendBack }) => {
          let isActive = true;

          // We call the extractStatements function and pass a custom callback (onStatement)
          // that will be called by the graph every time a new statement is extracted. This 
          // custom callback then sends an event back to the state machine with the new 
          // statement, which allows us to update the UI in real-time as new 
          // statements are extracted.
          verifyStatements({
            statements: input.statements,
            references: input.references,

            // Custom callback function
            onVerification: (statement) => {
              if (isActive) {
                sendBack({ type: "STATEMENT_VERIFICATION_NEW_DATA", statement });
              }
            },
          })
            .then(() => {
              if (isActive) {
                sendBack({ type: "STATEMENT_VERIFICATION_COMPLETE" });
              }
            })
            .catch((error) => {
              if (isActive) {
                sendBack({ type: "STATEMENT_VERIFICATION_ERROR", error });
              }
            });

          return () => {
            isActive = false;
          };
        }),
        input: ({ context }) => ({ statements: context.statements, references: context.references }),
      }
    },
    done: { type: "final" }
  },


  on : {
    STATEMENT_VERIFICATION_NEW_DATA: {
      actions: assign({
        statements: ({ context, event }) => new Map(context.statements).set(event.statement?.sentence?.id, event.statement)
      })
    },

    STATEMENT_VERIFICATION_ERROR: {
      target: "#extraction-verification-pipeline.error",
      actions: assign({
        error: ({ event }) => event?.error ?? event?.data ?? event
      }),
    },

    STATEMENT_VERIFICATION_COMPLETE: {
      target: ".done"
    },
  },

  onDone: {
    target: "#extraction-verification-pipeline.done"
  },
}
//---------------------------------------------------------------------------------



//---------------------------------------------------------------------------------
// Factory function to create the main state machine
const constructStateMachine = ({pdfFilePath}) => {

  // The main state machine that manages the overall pipeline
  const stateMachine = createMachine({
    id: "extraction-verification-pipeline",
    initial: "pdfLoading",

    // Statements and references are stored in the context as they are extracted
    // If any error is triggered, the machine transitions to the error state and 
    // the error message can then be displayed in the UI
    context: {
        pdf: null,
        sentences: [],
        statements: new Map(),
        references: new Map(),
        error: null
    },

    states: {
      // The PDF loading stage is responsible for loading the PDF and preparing it for sentence extraction.
      pdfLoading: pdfLoadingStateManagement(pdfFilePath),

      // Extract the sentences from the PDF  
      sentenceExtraction: sentenceExtractionStateManagement,

      // This states runs both the statement and reference extraction graphs in parallel. The machine will only transition to the next stage once both extraction processes are complete.
      statementReferenceExtraction: {
        type: "parallel",
        states: {
            statementExtraction: statementExtractionStateManagement,
            referenceExtraction: referenceExtractionStateManagement,
        },
        onDone: "verification"
      },

      // The verifying state runs the statement verification graph
      verification: statementVerificationStateManagement,

      // Stops the execution of the machine when this state is reached.
      done: { type: "final" },

      // If any errors are encountered during extraction or verification, the machine transitions to the error state
      error: {
        entry: ({ context }) => {
          console.error(context.error);
        }
      }

    }
  });

  return stateMachine;
}
//---------------------------------------------------------------------------------


export default constructStateMachine;
