//import MarkdownRenderer from './markdown-renderer'
import { useCallback, useEffect, useState } from 'react'
import PdfRenderer from './pdf-renderer'
import SentenceSegmenter from './sentence-segmenter'
import ReferenceSection from './reference-section'
import { runReferenceExtractionGraph } from './graphs/reference-extraction-graph'
import './App.css'

import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";

function App() {
  const pdfFilePath = '/simucell3d-nat-comp-sci-paper.pdf'
  const [sentenceAreas, setSentenceAreas] = useState([])
  const [references, setReferences] = useState([])
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [isExtractingReferences, setIsExtractingReferences] = useState(false)
  const [segmentationError, setSegmentationError] = useState('')
  const [referenceError, setReferenceError] = useState('')

  const handleSegmentationStart = useCallback(() => {
    setIsSegmenting(true)
    setSegmentationError('')
    setReferenceError('')
    setReferences([])
    setSentenceAreas([])
  }, [])

  const handleSegmentationComplete = useCallback((segmentedAreas) => {
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
                  <h1>Statements</h1>
                  <p>{isSegmenting ? 'Segmenting sentences…' : `Detected segments: ${sentenceAreas.length}`}</p>
                  {segmentationError ? <p>{segmentationError}</p> : null}

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
