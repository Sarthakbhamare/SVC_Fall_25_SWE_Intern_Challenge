import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/hooks/useAuth'
import { Mail, Loader2 } from 'lucide-react'

interface MagicLinkAuthProps {
  onClose?: () => void
}

export function MagicLinkAuth({ onClose }: MagicLinkAuthProps) {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Prevent double submission
    if (loading || emailSent) {
      return
    }

    setLoading(true)
    setError('')

    if (!email) {
      setError('Please enter your email address')
      setLoading(false)
      return
    }

    try {
      const { error: authError } = await signInWithMagicLink(email)

      if (authError) {
        setError(authError.message)
      } else {
        setEmailSent(true)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-green-800">Check Your Email</CardTitle>
          <CardDescription>
            We've sent a magic link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-gray-600 mb-4">
            Click the link in your email to sign in to your account. The link will expire in 1 hour.
          </p>
          <Button 
            variant="outline" 
            onClick={() => {
              setEmailSent(false)
              setEmail('')
            }}
            className="w-full"
          >
            Send Another Link
          </Button>
          {onClose && (
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="w-full mt-2"
            >
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your email to receive a magic link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending Magic Link...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Magic Link
              </>
            )}
          </Button>

          {onClose && (
            <Button 
              type="button"
              variant="ghost" 
              onClick={onClose}
              className="w-full"
            >
              Cancel
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
