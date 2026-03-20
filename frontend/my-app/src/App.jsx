import MarkdownRenderer from './markdown-renderer'
import './App.css'

import {
  Group,
  Panel,
  Separator,
} from "react-resizable-panels";

function App() {
  return (
    <>
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-bg_shade_3">

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
              <MarkdownRenderer />
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

                </Panel>

                <Separator className="h-1 bg-gray2 rounded" />

                {/* Reference Section */}
                <Panel defaultSize={50} minSize={20} id="vertical-group-pannel-2" className='h-full w-full bg-bg_shade_1 rounded-xl overflow-auto p-2'>
                  <h1>References</h1>
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
