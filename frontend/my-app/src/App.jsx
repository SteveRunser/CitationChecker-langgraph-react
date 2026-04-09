//import MarkdownRenderer from './markdown-renderer'
import { useCallback, useEffect, useState } from 'react'
import PdfRenderer from './pdf-renderer'
import SentenceSegmenter from './sentence-segmenter'
import ReferenceSection from './reference-section'
import StatementSection from './statement-section'
import { runReferenceExtractionGraph } from './graphs/reference-extraction-graph'
import { runStatementExtractionGraph } from './graphs/statement-extraction-graph'
import './App.css'

import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";

const DEV_EXTRACTION_CACHE_READ_ENABLED = true
const DEV_EXTRACTION_CACHE_WRITE_ENABLED = true

const getCacheFileName = (type, pdfPath) => {
  const safePdfName = (pdfPath ?? 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase()
  return `${safePdfName}_${type}.json`
}

const readJsonFromLocalStorage = (key) => {
  try {
    const rawValue = window.localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

const writeJsonToLocalStorage = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const readJsonFromOpfs = async (fileName) => {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null
  }

  try {
    const rootDirectory = await navigator.storage.getDirectory()
    const fileHandle = await rootDirectory.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    const rawText = await file.text()
    return rawText ? JSON.parse(rawText) : null
  } catch {
    return null
  }
}

const writeJsonToOpfs = async (fileName, value) => {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return false
  }

  try {
    const rootDirectory = await navigator.storage.getDirectory()
    const fileHandle = await rootDirectory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(value, null, 2))
    await writable.close()
    return true
  } catch {
    return false
  }
}

const loadCachedExtraction = async (type, pdfPath) => {
  if (!DEV_EXTRACTION_CACHE_READ_ENABLED) {
    return null
  }

  const fileName = getCacheFileName(type, pdfPath)
  const localStorageKey = `citation_checker_cache_${fileName}`
  const opfsValue = await readJsonFromOpfs(fileName)

  if (opfsValue) {
    return opfsValue
  }

  return readJsonFromLocalStorage(localStorageKey)
}

const saveCachedExtraction = async (type, pdfPath, value) => {
  if (!DEV_EXTRACTION_CACHE_WRITE_ENABLED) {
    return
  }

  const fileName = getCacheFileName(type, pdfPath)
  const localStorageKey = `citation_checker_cache_${fileName}`
  const wroteToOpfs = await writeJsonToOpfs(fileName, value)
  const wroteToLocalStorage = writeJsonToLocalStorage(localStorageKey, value)

  if (!wroteToOpfs && !wroteToLocalStorage) {
    console.warn(`[cache] Failed to save ${type} cache for ${pdfPath}`)
  }
}

function App() {
  const pdfFilePath = '/simucell3d-nat-comp-sci-paper.pdf'


  //---------------------------------------------------------------------------------------------
  // Sentences are as their name indicate sentences that have been extracted from the text of the
  // PDF. In addition of containing text, they also contain the token that constitute them. These 
  // tokens can be used to link back the sentences to the original PDF text and position. 
  const [sentences, setSentences] = useState([])

  // Statements are special sentences that have been identified as containing a claim. 
  // They contain the underlying sentence object, but also a summary of the claim, 
  // the validation status of the claim and the citations that support this claim.
  const [statements, setStatements] = useState([])
  const [selectedStatement, setSelectedStatement] = useState(null)

  // References as their names indicate contain all the data related to the references cited in the paper. 
  // They contain the reference id, title, authors and other metadata when available.
  const [references, setReferences] = useState([])

  // The following state variables are used to keep track of the loading and error status of the different steps of the pipeline.
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [isExtractingStatements, setIsExtractingStatements] = useState(false)
  const [isExtractingReferences, setIsExtractingReferences] = useState(false)

  // These states are used to display loading indicators and error messages in the UI, 
  // and to prevent certain actions from being triggered while a step is in progress.
  const [segmentationError, setSegmentationError] = useState('')
  const [statementError, setStatementError] = useState('')
  const [referenceError, setReferenceError] = useState('')
  //---------------------------------------------------------------------------------------------


  //---------------------------------------------------------------------------------------------
  // Callback to handle the start of the sentence segmentation process. 
  // It sets the isSegmenting state to true and clears any previous errors.
  const handleSegmentationStart = useCallback(() => {
    setIsSegmenting(true)
    setSegmentationError('')
    setStatementError('')
    setReferenceError('')
  }, [])

  // Callback to handle the completion of the sentence segmentation process.
  // It receives the segmented sentences as an argument, updates the sentences state, and sets isSegmenting to false.
  // It also clears the statements and references states to prepare for the next steps of the pipeline.
  const handleSegmentationComplete = useCallback((segmentedSentences) => {
    setStatements([])
    setSelectedStatement(null)
    setReferences([])
    setSentences(segmentedSentences ?? [])
    setIsSegmenting(false)
  }, [])


  // Callback to handle the click on a statement. 
  const handleStatementClick = useCallback((statement) => {
    setSelectedStatement(statement);
    console.log('Statement clicked:', statement);
  }, [])

  //Callback to handle any errors that occur during the sentence segmentation process.
  const handleSegmentationError = useCallback((error) => {
    setSegmentationError(error?.message ?? 'Sentence segmentation failed')
    setIsSegmenting(false)
  }, [])
  //---------------------------------------------------------------------------------------------


  //---------------------------------------------------------------------------------------------
  // The following useEffect hook is responsible for running the reference 
  // extraction processes whenever the sentences state is updated and the segmentation process 
  // is not currently running. 
  useEffect(() => {
    if (isSegmenting || sentences.length === 0) {
      return
    }

    let isCancelled = false

    const runExtraction = async () => {
      try {
        setReferenceError('')
        const cachedReferences = await loadCachedExtraction('references', pdfFilePath)

        if (!isCancelled && cachedReferences !== null) {
          setReferences(Array.isArray(cachedReferences) ? cachedReferences : [])
          return
        }

        setIsExtractingReferences(true)

        // Run the reference extraction graph with the segmented sentences and a callback to handle each extracted reference in real time.
        const finalReferences = await runReferenceExtractionGraph(sentences, {
          onReference: (reference) => {
            if (isCancelled) {
              return
            }

            setReferences((current) => {
              const key = `${reference?.ref_id ?? ''}::${(reference?.title ?? '').trim().toLowerCase()}`
              const alreadyExists = current.some((item) => {
                const itemKey = `${item?.ref_id ?? ''}::${(item?.title ?? '').trim().toLowerCase()}`
                return itemKey === key
              })

              if (alreadyExists) {
                return current
              }

              return [...current, reference]
            })
          },
        })

        if (!isCancelled) {
          setReferences(finalReferences)
          await saveCachedExtraction('references', pdfFilePath, finalReferences)
        }
      } catch (error) {
        if (!isCancelled) {
          setReferenceError(error?.message ?? 'Reference extraction failed')
          console.error('[references] Extraction failed', error)
        }
      } finally {
        if (!isCancelled) {
          setIsExtractingReferences(false)
        }
      }
    }

    runExtraction()

    return () => {
      isCancelled = true
    }
  }, [sentences, isSegmenting, pdfFilePath])
  //---------------------------------------------------------------------------------------------




  //---------------------------------------------------------------------------------------------
  // This useEffect hook is responsible for running the statement extraction.
  useEffect(() => {
    if (isSegmenting || sentences.length === 0) {
      return
    }
    let isCancelled = false
    const runStatementExtraction = async () => {
      try {
        setStatementError('')
        const cachedStatements = await loadCachedExtraction('statements', pdfFilePath)

        if (!isCancelled && cachedStatements !== null) {
          setStatements(Array.isArray(cachedStatements) ? cachedStatements : [])
          return
        }

        setIsExtractingStatements(true)

        const extractedStatements = await runStatementExtractionGraph(sentences, {
          onStatement: (statement) => {
            if (isCancelled) {
              return
            }

            setStatements((current) => {
              const key = `${statement?.sentence_id ?? ''}::${(statement?.claim ?? '').trim().toLowerCase()}`
              const alreadyExists = current.some((item) => {
                const itemKey = `${item?.sentence_id ?? ''}::${(item?.claim ?? '').trim().toLowerCase()}`
                return itemKey === key
              })

              if (alreadyExists) {
                return current
              }

              return [...current, statement]
            })

            console.log('[statements] Streamed', statement)
          },
        })

        if (!isCancelled) {
          setStatements(extractedStatements)
          await saveCachedExtraction('statements', pdfFilePath, extractedStatements)
          console.log('[statements] Extraction finished', extractedStatements)
        }
      } catch (error) {
        if (!isCancelled) {
          setStatementError(error?.message ?? 'Statement extraction failed')
          console.error('[statements] Extraction failed', error)
        }
      } finally {
        if (!isCancelled) {
          setIsExtractingStatements(false)
        }
      }
    }

    runStatementExtraction()

    return () => {
      isCancelled = true
    }
  }, [sentences, isSegmenting, pdfFilePath])
  //---------------------------------------------------------------------------------------------


  //---------------------------------------------------------------------------------------------
  return (
    <>
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-bg_shade_3">
        <SentenceSegmenter
          pdfFilePath={pdfFilePath}
          onStart={handleSegmentationStart}
          onComplete={handleSegmentationComplete}
          onError={handleSegmentationError}
        />

        <div className="flex flex-1 h-full w-full p-1">
          
          <Group 
            orientation="horizontal"
            id="horizontal-group"
            className="h-full w-full"
          >

            {/* Article Visualization Section */}
            <Panel 
              id="horizontal-group-pannel-1"
              defaultSize={55}
              minSize={20}
              className="h-full w-full bg-bg_shade_1 rounded-xl overflow-auto p-2" 
            >
              <PdfRenderer
                pdfFilePath={pdfFilePath}
                statements={statements}
                selectedStatement={selectedStatement}
                onStatementClick={handleStatementClick}
              />
            </Panel>

            <Separator className="w-1 bg-gray2 rounded" />

            <Panel 
              id="horizontal-group-pannel-2"
              defaultSize={45}
              minSize={20}
              className="h-full w-full"
            >

              <Group 
                orientation="vertical"
                id="vertical-group"
                className="h-full w-full"
              >

                {/* Statement Section */}
                <Panel defaultSize={50} minSize={20} id="vertical-group-pannel-1" className='h-full w-full bg-bg_shade_1 rounded-xl overflow-auto p-2'>
                  <StatementSection
                    statements={statements}
                    handleStatementClick={handleStatementClick}
                    selectedStatement={selectedStatement}
                    isExtracting={isExtractingStatements}
                    error={statementError || segmentationError}
                  />

                </Panel>

                <Separator className="h-1 bg-gray2 rounded" />

                {/* Reference Section */}
                <Panel defaultSize={50} minSize={20} id="vertical-group-pannel-2" className='h-full w-full '>
                  <ReferenceSection
                    references={references}
                    isExtracting={isExtractingReferences}
                    error={referenceError}
                  />
                </Panel>
              </Group>

            </Panel>

          </Group>



          
        </div>

        <div className="h-fit w-full bg-bg_shade_1 p-2 border-t border-text_shade_1">
          <p>FOOTER</p>
        </div>

        
      </div>
    </>
  )
}

export default App
