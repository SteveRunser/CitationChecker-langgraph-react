import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

function ErrorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const errorMessage = location.state?.message || 'Something went wrong while processing the PDF.'

  return (
    <div className="min-h-screen w-screen bg-bg_shade_3 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-bg_shade_1 rounded-2xl border border-text_shade_1 shadow-xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-bg_shade_2 flex items-center justify-center">
            <AlertTriangle size={20} className="text-text_shade_3" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text_shade_3">Processing Error</h1>
            <p className="text-sm text-text_shade_1">We could not complete the extraction pipeline.</p>
          </div>
        </div>


    
        <div className="rounded-xl border border-text_shade_1 bg-bg_shade_2 p-4 text-sm text-text_shade_3 break-words whitespace-pre-wrap max-h-60 overflow-auto">
          {errorMessage}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-text_shade_1 bg-bg_shade_2 px-4 py-2 text-sm font-semibold text-text_shade_3 hover:bg-bg_shade_1"
          >
            <ArrowLeft size={16} />
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}

export default ErrorPage
