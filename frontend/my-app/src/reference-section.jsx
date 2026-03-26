import { BookOpenText, LoaderCircle } from "lucide-react";


function ReferenceSection({ references = [], isExtracting = false, error = '' }) {

    return (
      <div className="w-full h-full flex flex-col bg-bg_shade_1 rounded-xl overflow-auto gap-2">
        
        <div id="reference-header" className="flex flex-row w-full items-center justify-between  px-4 py-2 ">

          <div className="flex flex-row items-center gap-2">
            <BookOpenText size={24} className="text-text_shade_3" />
            <h1 className="text-2xl font-semibold">References</h1>
          </div>

          <div className="flex flex-row items-center gap-2">

            {/* Show a small loading spinner if we're waiting for streamed references */}
            {isExtracting ? (
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

          {error ? <p>{error}</p> : null}

          {references.length === 0 ? (
              <p className="text-center text-lg">
                {isExtracting ? 'Extracting references. This may take a few minutes.' : 'No references yet.'}
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

  return (
    <article className="w-full rounded-lg border border-text_shade_1 p-3">
      <p className="font-semibold flex items-center gap-2">

        {/* Small circle indicating if the paper is open access with downloaded content (green) or not (red).  */}
        <span
          className={`inline-block h-3 w-3 rounded-full ${hasDownloadedContent ? 'bg-green-500/50' : 'bg-red-500/50'}`}
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