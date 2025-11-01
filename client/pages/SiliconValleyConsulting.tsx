import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ExternalLink, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import {
  ContractorRequestSchema,
  type ContractorRequest,
  type ContractorRequestResponse,
} from "@shared/schemas";
import { useAuth } from "@/hooks/useAuth";
import { UserMenu } from "@/components/UserMenu";

interface CurrencyRate {
  code: string;
  symbol: string;
  rate: number;
}

interface SiliconValleyConsultingProps {
  initialCanStartJob?: boolean;
}

export default function SiliconValleyConsulting({ initialCanStartJob = false }: SiliconValleyConsultingProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [joinSlackRequested, setJoinSlackRequested] = useState(false);
  const [canStartJob, setCanStartJob] = useState(initialCanStartJob);
  const [message, setMessage] = useState("");
  const [currency, setCurrency] = useState<CurrencyRate>({
    code: "USD",
    symbol: "$",
    rate: 1,
  });
  const [currencyLoading, setCurrencyLoading] = useState(true);

  useEffect(() => {
    // Get user's location and currency based on IP with robust error handling
    const detectCurrency = async () => {
      try {
        // First try to get location data with timeout
        const locationController = new AbortController();
        const locationTimeout = setTimeout(() => locationController.abort(), 3000);

        const response = await fetch("https://ipapi.co/json/", {
          signal: locationController.signal,
          headers: {
            'Accept': 'application/json',
          }
        });

        clearTimeout(locationTimeout);

        if (!response.ok) {
          throw new Error(`Location API responded with ${response.status}`);
        }

        const data = await response.json();

        if (data.currency && data.currency !== "USD") {
          // Try to get exchange rate with timeout
          const exchangeController = new AbortController();
          const exchangeTimeout = setTimeout(() => exchangeController.abort(), 3000);

          const exchangeResponse = await fetch(
            `https://api.exchangerate-api.com/v4/latest/USD`,
            {
              signal: exchangeController.signal,
              headers: {
                'Accept': 'application/json',
              }
            }
          );

          clearTimeout(exchangeTimeout);

          if (!exchangeResponse.ok) {
            throw new Error(`Exchange API responded with ${exchangeResponse.status}`);
          }

          const exchangeData = await exchangeResponse.json();

          if (exchangeData.rates && exchangeData.rates[data.currency]) {
            const currencySymbols: { [key: string]: string } = {
              EUR: "€",
              GBP: "£",
              JPY: "¥",
              CAD: "C$",
              AUD: "A$",
              CHF: "Fr",
              CNY: "¥",
              INR: "₹",
            };

            setCurrency({
              code: data.currency,
              symbol: currencySymbols[data.currency] || data.currency,
              rate: exchangeData.rates[data.currency],
            });
            console.log(`Currency detected: ${data.currency}`);
          } else {
            console.warn(`Exchange rate not available for ${data.currency}, using USD`);
          }
        } else {
          console.log("Using default USD currency");
        }
      } catch (error) {
        // Handle different types of errors gracefully
        if (error.name === 'AbortError') {
          console.warn("Currency detection timed out, using USD");
        } else if (error instanceof TypeError && error.message.includes('NetworkError')) {
          console.warn("Network error during currency detection, using USD");
        } else {
          console.warn("Currency detection failed:", error.message, "- using USD");
        }

        // Always fall back to USD on any error
        setCurrency({
          code: "USD",
          symbol: "$",
          rate: 1,
        });
      } finally {
        setCurrencyLoading(false);
      }
    };

    // Add a small delay to prevent immediate API calls on page load
    const timer = setTimeout(detectCurrency, 500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const formatCurrency = (amount: number) => {
    const converted = (amount * currency.rate).toFixed(2);
    return `${currency.symbol}${converted}`;
  };

  const handleJoinSlack = async () => {
    // Check if user is authenticated
    if (!user?.email) {
      setMessage("Please sign in to join this company. Click the user menu in the top right to sign in.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const requestData: ContractorRequest = {
        email: user.email,
        companySlug: "silicon-valley-consulting",
        companyName: "Silicon Valley Consulting",
      };

      const validatedData = ContractorRequestSchema.parse(requestData);

      const response = await fetch("/api/contractor-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validatedData),
      });

      // Check if response is OK first
      if (!response.ok) {
        // Try to parse JSON error message, fallback to status text
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;

            // Special handling for "User not found" error
            if (errorData.message.includes("User not found") || errorData.message.includes("qualification form")) {
              errorMessage = "You need to complete the qualification form first. Redirecting you there now...";
              setTimeout(() => {
                navigate("/social-qualify-form");
              }, 3000);
            }
          }
        } catch {
          // If JSON parsing fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      // Only parse JSON if response is OK
      const result: ContractorRequestResponse = await response.json();

      if (result.success) {
        setJoinSlackRequested(true);
        setMessage(result.message);
      }
    } catch (err: any) {
      setMessage(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleStartJob = () => {
    // This would navigate to job dashboard or show job instructions
    alert(
      "Job dashboard coming soon! You'll be able to submit daily tasks and track payments here.",
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FD</span>
            </div>
            <span className="text-xl font-bold text-gray-900">FairDataUse</span>
          </div>
          <div className="flex items-center space-x-6">
            <nav className="hidden md:flex space-x-6">
              <a
                href="/marketplace"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Marketplace
              </a>
              <a
                href="/marketplace"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Browse Companies
              </a>
            </nav>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Company Header */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-2xl">SVC</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Silicon Valley Consulting
            </h1>
            <div className="flex items-center justify-center gap-4 mb-4">
              <a
                href="https://SiliconValleyConsulting.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                SiliconValleyConsulting.io
              </a>
            </div>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A marketing consultancy helping technology companies grow their
              communities and engagement
            </p>
          </div>

          {/* Compensation */}
          <Card className="mb-8 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-800 flex items-center gap-2">
                💰 Compensation Package
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">
                  {currencyLoading
                    ? "$--/hour + $--- bonus"
                    : `${formatCurrency(2.00)}/hour + ${formatCurrency(500)} performance bonus`}
                </div>
                <p className="text-green-700">
                  Competitive hourly rate with significant performance
                  incentives
                </p>
                {currency.code !== "USD" && !currencyLoading && (
                  <p className="text-sm text-green-600 mt-2">
                    Prices shown in {currency.code} (converted from USD)
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info Section */}
          <div className="mt-16 mb-16 bg-blue-50 rounded-lg p-8 border border-blue-200">
            <div className="text-center max-w-4xl mx-auto">
              <AlertTriangle className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-blue-900 mb-4">
                How Our Marketplace Works
              </h3>
              <div className="space-y-4 text-blue-800">
                <p>
                  <strong>Step 1:</strong> Complete your first assignment with your first match (Silicon Valley Consulting) to establish your reputation and work quality.
                </p>
                <p>
                  <strong>Step 2:</strong> Receive a positive review (4+ stars) from your initial company to unlock additional opportunities.
                </p>
                <p>
                  <strong>Step 3:</strong> Browse and apply to work with multiple companies simultaneously, increasing your earning potential.
                </p>
                <p className="text-sm">
                  This system ensures high-quality part-ttime contractors and helps companies find reliable talent through proven track records.
                </p>
              </div>
            </div>
          </div>

          {/* Current Tasks */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Part-time Tasks</CardTitle>
              <CardDescription>
                What you'll be doing for Silicon Valley Consulting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      Reddit Community Engagement
                    </h4>
                    <p className="text-gray-600">
                      Role play as authentic users of SVC's clients to help their clients
                      grow their subreddit communities organically.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      Content Creation
                    </h4>
                    <p className="text-gray-600">
                      Create authentic posts, comments, and discussions that
                      align with client objectives.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      Community Building
                    </h4>
                    <p className="text-gray-600">
                      Help foster genuine discussions and engagement within
                      target communities.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Onboarding & Payment Process</CardTitle>
              <CardDescription>
                Step-by-step process to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Join Company Slack
                    </h4>
                    <p className="text-gray-600">
                      Click the "Join Slack" button below. We'll contact
                      Silicon Valley Consulting to get an invite link sent to you within 72 hours.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Review Getting Started Docs
                    </h4>
                    <p className="text-gray-600">
                      Once you join their Slack, they'll provide comprehensive
                      how-to-get-started documentation. Read through everything
                      carefully.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Start Job & Payment Security
                    </h4>
                    <p className="text-gray-600">
                      Return here and click "Start Job". We'll automatically
                      deduct 1 month's pay from their company account to ensure
                      you get paid.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Daily Task Submission
                    </h4>
                    <p className="text-gray-600">
                      Complete daily tasks and submit proof (links, screenshots)
                      here. A FairDataUse team member will verify within 7 days
                      and release your weekly payment.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    5
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Payment Setup
                    </h4>
                    <p className="text-gray-600">
                      After your first payment is released, you'll receive a
                      Stripe link to set up direct deposit for future payments.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Authentication Status */}
          {!user?.email && (
            <Alert className="mb-6 border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Sign in required:</strong> You need to be signed in to join this company.
                Click the user menu in the top right corner to sign in with your email.
              </AlertDescription>
            </Alert>
          )}

          {user?.email && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Signed in as:</strong> {user.email}
              </AlertDescription>
            </Alert>
          )}

          {/* Messages */}
          {message && (
            <Alert className={`mb-6 ${message.includes("Redirecting") ? "border-blue-200 bg-blue-50" : ""}`}>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {joinSlackRequested ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Slack Request Sent
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5 text-blue-600" />
                      Join Company Slack
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {joinSlackRequested
                    ? "We've notified the company. Check your email within 72 hours."
                    : "Request an invitation to the company's Slack workspace"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleJoinSlack}
                  disabled={loading || joinSlackRequested}
                  className="w-full"
                  variant={joinSlackRequested ? "secondary" : "default"}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Requesting...
                    </>
                  ) : joinSlackRequested ? (
                    "Request Sent ✓"
                  ) : !user?.email ? (
                    "Sign In to Join Slack"
                  ) : (
                    "Join Slack"
                  )}
                </Button>
                {!user?.email && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    You must be signed in to request Slack access
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {canStartJob ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Ready to Start
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5 text-gray-400" />
                      Start Job
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {canStartJob
                    ? "The company has approved you as a contractor"
                    : "Available after company approval"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleStartJob}
                  disabled={!canStartJob}
                  className="w-full"
                  variant={canStartJob ? "default" : "secondary"}
                >
                  {canStartJob ? "Start Job" : "Waiting for Approval"}
                </Button>
                {!canStartJob && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    This button will be enabled once the company accepts you as
                    a contractor
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Security Notice */}
          <Card className="mt-8 border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="text-blue-600 text-xl">🔒</div>
                <div>
                  <h4 className="font-semibold text-blue-900 mb-2">
                    Payment Protection
                  </h4>
                  <p className="text-blue-800 text-sm">
                    FairDataUse holds company funds in escrow to guarantee your
                    payment. You'll only work after we've secured payment for
                    your services.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
