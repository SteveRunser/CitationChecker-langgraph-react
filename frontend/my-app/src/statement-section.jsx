import { useEffect, useRef } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'

function StatementSection({ statements = [], handleStatementClick=null, selectedStatement=null, isExtracting = false, error = '' }) {
	const statementElementRefs = useRef({})

	const getStatementId = (statement) => statement?.id ?? statement?.sentence?.id ?? statement?.sentence_id ?? null

	useEffect(() => {
		const selectedId = getStatementId(selectedStatement)

		if (!selectedId) {
			return
		}

		const selectedElement = statementElementRefs.current[selectedId]

		if (selectedElement) {
			selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
		}
	}, [selectedStatement, statements])

	return (
		<div className="w-full h-full flex flex-col bg-bg_shade_1 rounded-xl overflow-auto gap-2">
			<div id="statement-header" className="flex flex-row w-full items-center justify-between px-4 py-2">
				<div className="flex flex-row items-center gap-2">
					<FileText size={24} className="text-text_shade_3" />
					<h1 className="text-2xl font-semibold">Statements</h1>
				</div>

				<div className="flex flex-row items-center gap-2">
					{isExtracting ? (
						<div className="flex h-8 w-8 items-center justify-center rounded-full">
							<LoaderCircle size={24} className="text-blue-600 animate-spin [animation-duration:650ms]" />
						</div>
					) : null}

					<p className="text-lg text-text_shade_3 font-bold ">{`[${statements.length}]`}</p>
				</div>
			</div>

			<div id="statement-content" className="flex-1 p-4 overflow-auto flex flex-col gap-4">
				{error ? <p>{error}</p> : null}

				{statements.length === 0 ? (
					<p className="text-center text-lg">
						{isExtracting ? 'Extracting statements. This may take a few minutes.' : 'No statements yet.'}
					</p>
				) : (
					statements.map((statement, index) => {
						const statementId = getStatementId(statement)

						return (
						<StatementCard
							key={index}
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
							onClick={handleStatementClick ? () => handleStatementClick(statement) : undefined}
						/>
						)
					})
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
			className={`w-full rounded-lg border ${isSelected ?  "border-blue-500/50 border-2" : "border-text_shade_1" } p-3 flex flex-col gap-1 ${onClick ? 'cursor-pointer' : ''}`}
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
				<span className="font-semibold">Verification: </span>
				{statement?.verification_result || 'Unverified'}
			</p>
		</article>
	)
}

export default StatementSection
