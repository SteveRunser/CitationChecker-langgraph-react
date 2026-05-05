import { useCallback, useEffect, useState, useMemo } from 'react'
import PdfRenderer from './pdf-renderer'
import ReferenceSection from './reference-section'
import StatementSection from './statement-section'
import './App.css'
import constructStateMachine from './state-machine'
import { useMachine } from "@xstate/react";

import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";


function App() {
  const pdfFilePath = '/simucell3d-nat-comp-sci-paper.pdf'

  // Construct the state machine with the path to the PDF file as a parameter.
  // useMemo is used to ensure that the state machine is only re-created if the pdfFilePath changes, which prevents unnecessary resets of the state machine. 
  const machine = useMemo(() => constructStateMachine({ pdfFilePath }),
    [pdfFilePath]
  );

  const [state, send] = useMachine(machine);

  // Use this state and callback to synchronize the highlighted statement
  //  between the PDF renderer and the statement section.
  const [selectedStatement, setSelectedStatement] = useState(null);

  const onStatementClick = useCallback((statement) => {
    setSelectedStatement(statement);
  }, []);
  
  
  //---------------------------------------------------------------------------------------------
  return (
    <>
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-bg_shade_3">
        <div className="flex flex-1 min-h-0 w-full p-1">
          
          <Group 
            orientation="horizontal"
            id="horizontal-group"
            className="h-full min-h-0 w-full"
          >

            {/* Article Visualization Section */}
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

                {/* Statement Section */}
                <Panel defaultSize={50} minSize={20} id="vertical-group-pannel-1" className='h-full min-h-0 w-full bg-bg_shade_1 rounded-xl overflow-auto'>
                  <StatementSection
                    state={state}
                    onStatementClick={onStatementClick}
                    selectedStatement={selectedStatement}
                  />

                </Panel>

                <Separator className="h-1 bg-gray2 rounded outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0" />

                {/* Reference Section */}
                <Panel defaultSize={50} minSize={20} id="vertical-group-pannel-2" className='h-full min-h-0 w-full '>
                  <ReferenceSection
                    state={state}
                  />
                </Panel>
              </Group>

            </Panel>

          </Group>



          
        </div>

        <div className="h-fit shrink-0 w-full bg-bg_shade_2 p-2 border-t rounded-t-xl border-text_shade_1">
          <p>FOOTER</p>
        </div>

        
      </div>
    </>
  )
}

export default App
