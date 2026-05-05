import { BookOpenText, LoaderCircle } from "lucide-react";


function ReferenceSection({ state }) {

  const references = state?.context?.references ?? [];
  const isReferenceExtractionRunning = state.matches("statementReferenceExtraction.referenceExtraction.running");

  return (
    <div className="w-full h-full flex flex-col bg-bg_shade_1 rounded-xl overflow-auto gap-2">
      
      <div id="reference-header" className="flex flex-row w-full items-center justify-between  px-4 py-2 border-b border-text_shade_1 border-05">

        <div className="flex flex-row items-center gap-2 mx-2 my-1">
          <BookOpenText size={24} className="text-text_shade_3" />
          <h1 className="text-2xl font-semibold">References</h1>
        </div>

        <div className="flex flex-row items-center gap-2">

          {/* Show a small loading spinner if we're waiting for streamed references */}
          {isReferenceExtractionRunning ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full">
              <LoaderCircle size={24} className="text-blue-600 animate-spin [animation-duration:650ms]" />
            </div>
          ) : null}

          <p className="text-lg text-text_shade_3 font-bold ">
            {`[${references.length}]`}
          </p>
        </div>
      </div>

      <div id="reference-content" className="flex-1 p-4 overflow-auto flex flex-col gap-4">

        
        {references.length === 0 ? (
            <p className="text-center text-lg">
              {isReferenceExtractionRunning ? 'Extracting references. This may take a few minutes.' : 'No references yet.'}
            </p>
        ) : (
          references.map((reference, index) => (
            <ReferenceCard key={index} reference={reference} />
          ))
        )}
      </div>
    </div>
  );
}

const ReferenceCard = ({ reference }) => {
  const hasDownloadedContent = Boolean(reference?.is_open_access && reference?.content)
  const hasDoi = Boolean(reference?.doi)
  const doiUrl = hasDoi ? `https://doi.org/${reference.doi}` : null

  const handleCardClick = () => {
    if (!doiUrl) {
      return
    }

    window.open(doiUrl, '_blank', 'noopener,noreferrer')
  }

  const handleCardKeyDown = (event) => {
    if (!doiUrl) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardClick()
    }
  }

  return (
    <article
      className={`w-full rounded-lg border border-text_shade_1 p-3 transition-all duration-200 ${hasDoi ? 'cursor-pointer hover:shadow-xl hover:translate-x-1 hover:-translate-y-1 focus-visible:shadow-md focus-visible:translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={hasDoi ? 'button' : undefined}
      tabIndex={hasDoi ? 0 : undefined}
      aria-label={hasDoi ? `Open DOI link for ${reference?.title || 'reference'}` : undefined}
      title={hasDoi ? `Open ${doiUrl}` : undefined}
    >
      <p className="font-semibold flex items-center gap-2">

        {/* Small circle indicating if the paper is open access with downloaded content (green) or not (red).  */}
        <span
          className={`inline-block h-3 w-3 shrink-0 flex-none  rounded-full ${hasDownloadedContent ? 'bg-green-500/50' : 'bg-red-500/50'}`}
          aria-label={hasDownloadedContent ? 'reference content available' : 'reference content unavailable'}
          title={hasDownloadedContent ? 'Open access with downloaded content' : 'No downloaded content'}
        />

        {/* Reference and title of the paper */}
        <span>[{reference?.ref_id ?? '?'}] {reference?.title || 'Untitled'}</span>
      </p>

      {/* Journal and DOI */}
      <p>{reference?.journal || 'Unknown journal'} ({reference?.publication_year || null})</p>
        {reference?.doi ? <p>DOI: {reference.doi}</p> : null}
        {Array.isArray(reference?.authors) && reference.authors.length > 0 ? (
        <p>{reference.authors.join(', ')}</p>
      ) : null}

      {/* Open access status */}
      <p>
        <span className="font-semibold">Is open access: </span>
        {
          reference?.is_open_access === false
            ? "No"                   
            : reference?.is_open_access
              ? (reference?.content
                  ? "Yes"
                  : "Yes - but automatic download is blocked")
              : ""
        }
      </p>
    </article>
  );
}

export default ReferenceSection;