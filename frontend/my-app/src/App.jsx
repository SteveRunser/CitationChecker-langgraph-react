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

const DEV_EXTRACTION_CACHE_ENABLED = true

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
  if (!DEV_EXTRACTION_CACHE_ENABLED) {
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
  if (!DEV_EXTRACTION_CACHE_ENABLED) {
    return
  }

  const fileName = getCacheFileName(type, pdfPath)
  const localStorageKey = `citation_checker_cache_${fileName}`
  const wroteToOpfs = await writeJsonToOpfs(fileName, value)

  if (!wroteToOpfs) {
    writeJsonToLocalStorage(localStorageKey, value)
  }
}

function App() {
  const pdfFilePath = '/simucell3d-nat-comp-sci-paper.pdf'
  const [sentenceAreas, setSentenceAreas] = useState([])
  const [statements, setStatements] = useState([])
  const [references, setReferences] = useState([])
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [isExtractingStatements, setIsExtractingStatements] = useState(false)
  const [isExtractingReferences, setIsExtractingReferences] = useState(false)
  const [segmentationError, setSegmentationError] = useState('')
  const [statementError, setStatementError] = useState('')
  const [referenceError, setReferenceError] = useState('')

  const handleSegmentationStart = useCallback(() => {
    setIsSegmenting(true)
    setSegmentationError('')
    setStatementError('')
    setReferenceError('')
  }, [])

  const handleSegmentationComplete = useCallback((segmentedAreas) => {
    setStatements([])
    setReferences([])
    setSentenceAreas(segmentedAreas ?? [])
    setIsSegmenting(false)
  }, [])

  const handleSegmentationError = useCallback((error) => {
    setSegmentationError(error?.message ?? 'Sentence segmentation failed')
    setIsSegmenting(false)
  }, [])

  useEffect(() => {
    if (isSegmenting || sentenceAreas.length === 0) {
      return
    }

    let isCancelled = false

    const runExtraction = async () => {
      try {
        setReferenceError('')
        setIsExtractingReferences(true)

        const cachedReferences = await loadCachedExtraction('references', pdfFilePath)
        if (!isCancelled && Array.isArray(cachedReferences)) {
          setReferences(cachedReferences)
          console.log('[references] Loaded from cache', cachedReferences)
          return
        }

        const finalReferences = await runReferenceExtractionGraph(sentenceAreas, {
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
          console.log('[references] Extraction finished', finalReferences)
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
  }, [sentenceAreas, isSegmenting])

  useEffect(() => {
    if (isSegmenting || sentenceAreas.length === 0) {
      return
    }

    let isCancelled = false

    const runStatementExtraction = async () => {
      try {
        setStatementError('')
        setIsExtractingStatements(true)

        const cachedStatements = await loadCachedExtraction('statements', pdfFilePath)
        if (!isCancelled && Array.isArray(cachedStatements)) {
          setStatements(cachedStatements)
          console.log('[statements] Loaded from cache', cachedStatements)
          return
        }

        const extractedStatements = await runStatementExtractionGraph(sentenceAreas, {
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
  }, [sentenceAreas, isSegmenting])

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
              <PdfRenderer pdfFilePath={pdfFilePath} highlights={sentenceAreas} />
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
