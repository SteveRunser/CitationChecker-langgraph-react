import { createMachine, assign, fromCallback, fromPromise } from "xstate";
import { getDocument } from "pdfjs-dist";


import extractSentences from "./sentence-extraction";
import extractStatements from './graphs/statement-extraction-graph'
import extractReferences from './graphs/reference-extraction-graph'
import verifyStatements from './graphs/statement-verification-graph'

// const STORAGE_VERSION = 1;
// const STORAGE_DB_NAME = 'citationChecker';
// const STORAGE_STORE_NAME = 'stateMachineSnapshots';

// const buildStorageKey = (pdfFilePath) => {
//   const safePath = typeof pdfFilePath === 'string' ? pdfFilePath : '';
//   return `stateMachine:${encodeURIComponent(safePath)}`;
// };

// const serializeMap = (map) => (map instanceof Map ? Array.from(map.entries()) : []);
// const deserializeMap = (entries) => {
//   if (entries instanceof Map) {
//     return new Map(entries);
//   }
//   if (Array.isArray(entries)) {
//     return new Map(entries);
//   }
//   if (entries && typeof entries === 'object') {
//     return new Map(Object.entries(entries));
//   }
//   return new Map();
// };

// const openSnapshotDb = () => new Promise((resolve, reject) => {
//   if (typeof window === 'undefined' || !window.indexedDB) {
//     reject(new Error('IndexedDB not available'));
//     return;
//   }

//   const request = window.indexedDB.open(STORAGE_DB_NAME, STORAGE_VERSION);

//   request.onupgradeneeded = () => {
//     const db = request.result;
//     if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
//       db.createObjectStore(STORAGE_STORE_NAME);
//     }
//   };

//   request.onsuccess = () => resolve(request.result);
//   request.onerror = () => reject(request.error);
// });

// const getSnapshotFromDb = async (key) => {
//   const db = await openSnapshotDb();
//   return new Promise((resolve, reject) => {
//     const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
//     const store = tx.objectStore(STORAGE_STORE_NAME);
//     const request = store.get(key);
//     request.onsuccess = () => resolve(request.result ?? null);
//     request.onerror = () => reject(request.error);
//   });
// };

// const putSnapshotInDb = async (key, value) => {
//   const db = await openSnapshotDb();
//   return new Promise((resolve, reject) => {
//     const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
//     const store = tx.objectStore(STORAGE_STORE_NAME);
//     const request = store.put(value, key);
//     request.onsuccess = () => resolve();
//     request.onerror = () => reject(request.error);
//   });
// };

// const loadExtractionSnapshot = async (pdfFilePath) => {
//   try {
//     const raw = await getSnapshotFromDb(buildStorageKey(pdfFilePath));
//     if (!raw || raw?.version !== STORAGE_VERSION) return null;
//     return raw?.context ?? null;
//   } catch {
//     return null;
//   }
// };

// const saveExtractionSnapshot = async (pdfFilePath, context) => {
//   try {
//     const payload = {
//       version: STORAGE_VERSION,
//       savedAt: new Date().toISOString(),
//       context: {
//         sentences: Array.isArray(context?.sentences) ? context.sentences : [],
//         statements: serializeMap(context?.statements),
//         references: serializeMap(context?.references),
//       },
//     };

//     await putSnapshotInDb(buildStorageKey(pdfFilePath), payload);
//   } catch (error) {
//     console.warn('Failed to save extraction snapshot', error);
//   }
// };

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
// Load a saved extraction snapshot (if any) before running the pipeline.
const rehydrationStateManagement = (pdfFilePath) => ({
  invoke: {
    src: fromPromise(async () => loadExtractionSnapshot(pdfFilePath)),
    onDone: [
      {
        target: "verification",
        guard: ({ event }) => Boolean(event?.output),
        actions: assign({
          sentences: ({ event }) => event?.output?.sentences ?? [],
          statements: ({ event }) => deserializeMap(event?.output?.statements),
          references: ({ event }) => deserializeMap(event?.output?.references),
          error: () => null,
        }),
      },
      { target: "pdfLoading" },
    ],
    onError: {
      target: "pdfLoading",
    },
  },
});
//---------------------------------------------------------------------------------


//---------------------------------------------------------------------------------
// Sub-state machine for the statement extraction process
const statementExtractionStateManagement = (apiKey) => ({
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
            apiKey,

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
});
//---------------------------------------------------------------------------------


//---------------------------------------------------------------------------------
// Sub-state machine for the reference extract process. The logic is the same as for 
// the statement extraction sub-state machine, but it listens for different events 
// and updates a different part of the context.
const referenceExtractionStateManagement = (apiKey, userEmail) => ({
  initial: "running",
  states: {
    running: {
      invoke: {
        src: fromCallback(({ input, sendBack }) => {
          let isActive = true;

          extractReferences({
            sentences: input.sentences,
            apiKey,
            userEmail,
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
});
//---------------------------------------------------------------------------------



//---------------------------------------------------------------------------------
// Sub-state machine for the statement verification process
const statementVerificationStateManagement = (apiKey) => ({
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
            apiKey,

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
});
//---------------------------------------------------------------------------------



//---------------------------------------------------------------------------------
// Factory function to create the main state machine
const constructStateMachine = ({ pdfFilePath, apiKey, userEmail }) => {

  // The main state machine that manages the overall pipeline
  const stateMachine = createMachine({
    id: "extraction-verification-pipeline",
    initial: "rehydrating",

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
      // Attempt to load a saved extraction snapshot before running the pipeline.
      rehydrating: rehydrationStateManagement(pdfFilePath),

      // The PDF loading stage is responsible for loading the PDF and preparing it for sentence extraction.
      pdfLoading: pdfLoadingStateManagement(pdfFilePath),

      // Extract the sentences from the PDF  
      sentenceExtraction: sentenceExtractionStateManagement,

      // This states runs both the statement and reference extraction graphs in parallel. The machine will only transition to the next stage once both extraction processes are complete.
      statementReferenceExtraction: {
        type: "parallel",
        states: {
            statementExtraction: statementExtractionStateManagement(apiKey),
            referenceExtraction: referenceExtractionStateManagement(apiKey, userEmail),
        },
        onDone: {
          target: "verification",
          actions: ({ context }) => {
            void saveExtractionSnapshot(pdfFilePath, context);
          },
        }
      },

      // The verifying state runs the statement verification graph
      verification: statementVerificationStateManagement(apiKey),

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
