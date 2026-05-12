import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMachine } from '@xstate/react'
import PdfRenderer from '../pdf-renderer'
import ReferenceSection from '../reference-section'
import StatementSection from '../statement-section'
import constructStateMachine from '../state-machine'

import {
  Group,
  Panel,
  Separator,
} from 'react-resizable-panels'

function MainPage({ pdfFilePath, apiKey, userEmail }) {
  const navigate = useNavigate()
  const machine = useMemo(
    () => constructStateMachine({ pdfFilePath, apiKey, userEmail }),
    [pdfFilePath, apiKey, userEmail]
  )
  const [state] = useMachine(machine)

  const [selectedStatement, setSelectedStatement] = useState(null)

  const onStatementClick = useCallback((statement) => {
    setSelectedStatement(statement)
  }, [])

  useEffect(() => {
    if (state.matches('error')) {
      const message = state.context?.error?.message || String(state.context?.error || '')
      navigate('/error', { replace: true, state: { message } })
    }
  }, [navigate, state])

  if (!pdfFilePath) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-bg_shade_3">
        <div className="bg-bg_shade_1 border border-text_shade_1 rounded-xl p-6 text-text_shade_3">
          No PDF selected. Go back and choose a file.
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-bg_shade_3">
      <div className="flex flex-1 min-h-0 w-full p-1">
        <Group
          orientation="horizontal"
          id="horizontal-group"
          className="h-full min-h-0 w-full"
        >
          <Panel
            id="horizontal-group-pannel-1"
            defaultSize={55}
            minSize={20}
            className="h-full min-h-0 w-full bg-bg_shade_1 rounded-xl overflow-auto p-2"
          >
            <PdfRenderer
              state={state}
              pdfFilePath={pdfFilePath}
              onStatementClick={onStatementClick}
              selectedStatement={selectedStatement}
            />
          </Panel>

          <Separator className="w-1 bg-gray2 rounded outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0" />

          <Panel
            id="horizontal-group-pannel-2"
            defaultSize={45}
            minSize={20}
            className="h-full min-h-0 w-full"
          >
            <Group
              orientation="vertical"
              id="vertical-group"
              className="h-full min-h-0 w-full"
            >
              <Panel
                defaultSize={50}
                minSize={20}
                id="vertical-group-pannel-1"
                className="h-full min-h-0 w-full bg-bg_shade_1 rounded-xl overflow-auto"
              >
                <StatementSection
                  state={state}
                  onStatementClick={onStatementClick}
                  selectedStatement={selectedStatement}
                />
              </Panel>

              <Separator className="h-1 bg-gray2 rounded outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0" />

              <Panel
                defaultSize={50}
                minSize={20}
                id="vertical-group-pannel-2"
                className="h-full min-h-0 w-full"
              >
                <ReferenceSection state={state} />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  )
}

export default MainPage
