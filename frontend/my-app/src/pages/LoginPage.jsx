import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpenText, FileText, KeyRound, Mail } from 'lucide-react'

function LoginPage({ onLogin }) {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [pdfFile, setPdfFile] = useState(null)

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    setPdfFile(file ?? null)
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!email || !apiKey || !pdfFile) {
      return
    }

    const pdfUrl = URL.createObjectURL(pdfFile)
    onLogin({ email, apiKey, pdfFile, pdfUrl })
    navigate('/', { replace: true })
  }

  const isSubmitDisabled = !email || !apiKey || !pdfFile
  const selectedFileLabel = pdfFile?.name || 'No file selected'

  return (
    <div className="min-h-screen w-screen bg-bg_shade_3 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-bg_shade_1 rounded-2xl border border-text_shade_1 shadow-xl p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-bg_shade_2 flex items-center justify-center">
            <BookOpenText size={20} className="text-text_shade_3" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text_shade_3">Citation Checker</h1>
            <p className="text-sm text-text_shade_1">Provide credentials and a PDF to begin.</p>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-semibold text-text_shade_2">
            Email address
            <div className="flex items-center gap-2 rounded-lg border border-text_shade_1 bg-bg_shade_2 px-3 py-2">
              <Mail size={18} className="text-text_shade_1" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@domain.com"
                className="w-full bg-transparent text-text_shade_3 outline-none"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold text-text_shade_2">
            OpenAI API token
            <div className="flex items-center gap-2 rounded-lg border border-text_shade_1 bg-bg_shade_2 px-3 py-2">
              <KeyRound size={18} className="text-text_shade_1" />
              <input
                type="password"
                required
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
                className="w-full bg-transparent text-text_shade_3 outline-none"
                autoComplete="off"
              />
            </div>
          </label>

          <div className="flex flex-col gap-2 text-sm font-semibold text-text_shade_2">
            PDF file path
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-text_shade_1 bg-bg_shade_2 px-3 py-2">
                <FileText size={18} className="text-text_shade_1" />
                <input
                  type="text"
                  readOnly
                  value={selectedFileLabel}
                  className="w-full bg-transparent text-text_shade_3 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleBrowse}
                className="rounded-lg border border-text_shade_1 bg-bg_shade_2 px-4 py-2 text-sm font-semibold text-text_shade_3 hover:bg-bg_shade_1"
              >
                Browse
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-text_shade_1 font-normal">Only PDF files are accepted. The file stays on your device.</p>
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="mt-2 rounded-lg bg-text_shade_3 px-4 py-2 text-bg_shade_1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to workspace
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
