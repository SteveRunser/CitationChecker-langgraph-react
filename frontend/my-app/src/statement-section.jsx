import { useEffect, useRef } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'

function StatementSection({ state, onStatementClick, selectedStatement }) {
	

  const statements = state?.context?.statements ?? new Map();
  const isStatementExtractionRunning = state.matches("statementReferenceExtraction.statementExtraction.running");
  const isStatementVerificationRunning = state.matches("verification.running");
  
  //---------------------------------------------------------------------------------------------
  // Scrolling effect to scroll to the statement card that corresponds to the currently selected statement. This effect runs when the user clicks on a statement in the PDF renderer.
  const statementElementRefs = useRef({})
	useEffect(() => {
		if (!selectedStatement?.sentence?.id) {
			return
		}
		const selectedElement = statementElementRefs.current[selectedStatement.sentence.id]
		if (selectedElement) {
			selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
		}
	}, [selectedStatement])
  //---------------------------------------------------------------------------------------------


	return (
	<div className="w-full h-full flex flex-col bg-bg_shade_1 rounded-xl overflow-auto gap-2">
			
      <div id="statement-header" className="flex flex-row w-full items-center justify-between px-4 py-2 border-b border-text_shade_1 border-05 ">
        
				<div className="flex flex-row items-center gap-2 mx-2 my-1">
					<FileText size={24} className="text-text_shade_3" />
					<h1 className="text-2xl font-semibold">Statements</h1>
				</div>

				<div className="flex flex-row items-center gap-2">
					{(isStatementExtractionRunning || isStatementVerificationRunning) ? (
						<div className="flex h-8 w-8 items-center justify-center rounded-full">
							<LoaderCircle size={24} className="text-blue-600 animate-spin [animation-duration:650ms]" />
						</div>
					) : null}

					<p className="text-lg text-text_shade_3 font-bold ">{`[${statements.size}]`}</p>
				</div>
			</div>

			<div id="statement-content" className="flex-1 p-4 overflow-auto flex flex-col gap-4">
				
				{statements.size === 0 ? (
					<p className="text-center text-lg">
						{isStatementExtractionRunning ? 'Extracting statements. This may take a few minutes.' : 'No statements yet.'}
					</p>
				) : (
					Array.from(statements.entries()).map(([statementId, statement]) => (
						<StatementCard
							key={statementId}
							statement={statement}
							selectedStatement={selectedStatement}
							elementRef={(element) => {
								if (!statementId) {
									return
								}

								if (element) {
									statementElementRefs.current[statementId] = element
								} else {
									delete statementElementRefs.current[statementId]
								}
							}}
							onClick={onStatementClick ? () => onStatementClick(statement) : undefined}
						/>
					))
				)}
			</div>
		</div>
	)
}

const StatementCard = ({ statement, selectedStatement, onClick, elementRef }) => {

	let cardStatusColor = "";
	switch (statement?.verification_result) {
		case 'Supported':
			cardStatusColor = 'bg-green-500/50';
			break;
		case 'Contradicted':
			cardStatusColor = 'bg-red-500/50';
			break;
		case 'Unverified':
			cardStatusColor = 'bg-yellow-500/50';
			break;
		default:
			cardStatusColor = 'bg-yellow-500/50';
			break;
	}

  let isSelected = selectedStatement != null && statement?.sentence?.id === selectedStatement?.sentence?.id;


	return (
		<article
			ref={elementRef}
			className={`w-full transition-all duration-200 rounded-lg border ${isSelected ?  "border-blue-500/50 border-2" : "border-text_shade_1" } p-3 flex flex-col gap-1 ${onClick ? 'cursor-pointer' : ''} cursor-pointer hover:shadow-xl hover:translate-x-1 hover:-translate-y-1 focus-visible:shadow-md focus-visible:translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none`}
			onClick={onClick}
		>
			<p className="font-semibold flex items-center gap-2">

				{/* Circle with statement verification status: green for supported, red for contradicted, yellow for unverified. */}
				<span className={`inline-block h-3 w-3 shrink-0 flex-none rounded-full ${cardStatusColor}`}></span>

				{/* The id of the statement */}
				<span>{`[${statement?.sentence.id ?? 'Unknown ID'}]`}</span>

				{/* The title of the claim */}
				<span>{`- ${statement?.title ?? null}`}</span>
			</p>


			{/* The extracted claim */}
			<p><span className="font-semibold">Claim</span>: {statement?.claim || 'No claim extracted.'}</p>

			<p>
				<span className="font-semibold">Citations: </span> [
				{Array.isArray(statement?.citations) && statement.citations.length > 0
					? statement.citations.join(', ')
					: 'None'} 
				]
			</p>

			<p>
				<span className="font-semibold">Verification status: </span>
				{statement?.verification_result || 'Unverified'}
			</p>

			<p>
				<span className="font-semibold">Verification Explanation: </span>
				{statement?.verification_explanation || 'Verification not yet started.'}
			</p>
		</article>
	)
}

export default StatementSection
