
function ReferenceSection({ references = [], isExtracting = false, error = '' }) {

    return (
        <div className="w-full h-full flex flex-col bg-bg_shade_1 rounded-xl overflow-auto p-2 gap-2">
            <div className="flex items-center justify-between">
                <h1>References</h1>
                <p>{isExtracting ? 'Extracting references…' : `Count: ${references.length}`}</p>
            </div>

            {error ? <p>{error}</p> : null}

            {references.length === 0 ? (
                <p>{isExtracting ? 'Waiting for streamed references…' : 'No references yet.'}</p>
            ) : (
                references.map((reference, index) => (
                    <article
                        key={`${reference?.ref_id ?? 'na'}-${reference?.title ?? ''}-${index}`}
                        className="w-full rounded-lg border border-text_shade_1 p-3"
                    >
                        <p className="font-semibold">[{reference?.ref_id ?? '?'}] {reference?.title || 'Untitled'}</p>
                        <p>{reference?.journal || 'Unknown journal'}</p>
                        {reference?.publication_year ? <p>Year: {reference.publication_year}</p> : null}
                        {reference?.doi ? <p>DOI: {reference.doi}</p> : null}
                        {Array.isArray(reference?.authors) && reference.authors.length > 0 ? (
                            <p>Authors: {reference.authors.join(', ')}</p>
                        ) : null}
                    </article>
                ))
            )}
        </div>
    );
}

export default ReferenceSection;