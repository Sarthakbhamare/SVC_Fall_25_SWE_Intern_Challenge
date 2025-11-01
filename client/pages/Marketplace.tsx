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
import { UserMenu } from "@/components/UserMenu";
import {
  Users,
  Star,
  Lock,
  ExternalLink,
  AlertTriangle
} from "lucide-react";

export interface Company {
  id: string;
  name: string;
  acronym: string;
  description: string;
  hourlyRate: number;
  bonus: number;
  hiresCount: number;
  gradient: string;
  isAvailable: boolean;
  category: string;
}

interface CurrencyRate {
  code: string;
  symbol: string;
  rate: number;
}

interface MarketplaceProps {
  companiesOverride?: Company[];
}

export default function Marketplace({ companiesOverride }: MarketplaceProps = {}) {
  const navigate = useNavigate();
  const [showLockedAlert, setShowLockedAlert] = useState(false);
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

  const companies: Company[] = companiesOverride ?? [
    // Available company
    {
      id: "silicon-valley-consulting",
      name: "Silicon Valley Consulting",
      acronym: "SVC",
      description: "A marketing consultancy helping technology companies grow their communities and engagement",
      hourlyRate: 2.00,
      bonus: 500,
      hiresCount: 14,
      gradient: "from-purple-600 to-blue-600",
      isAvailable: true,
      category: "Marketing & Growth"
    },
    // Fake companies (blurred)
    {
      id: "tech-innovations",
      name: "Tech Innovations Corp",
      acronym: "TIC",
      description: "Leading technology solutions for enterprise clients",
      hourlyRate: 3.50,
      bonus: 750,
      hiresCount: 28,
      gradient: "from-green-600 to-teal-600",
      isAvailable: false,
      category: "Technology"
    },
    {
      id: "digital-marketing-pro",
      name: "Digital Marketing Pro",
      acronym: "DMP",
      description: "Full-service digital marketing agency for SaaS companies",
      hourlyRate: 4.00,
      bonus: 600,
      hiresCount: 35,
      gradient: "from-pink-600 to-red-600",
      isAvailable: false,
      category: "Digital Marketing"
    },
    {
      id: "growth-hackers-inc",
      name: "Growth Hackers Inc",
      acronym: "GHI",
      description: "Data-driven growth strategies for startups",
      hourlyRate: 2.75,
      bonus: 800,
      hiresCount: 22,
      gradient: "from-orange-600 to-yellow-600",
      isAvailable: false,
      category: "Growth & Analytics"
    },
    {
      id: "social-media-masters",
      name: "Social Media Masters",
      acronym: "SMM",
      description: "Social media management and community building",
      hourlyRate: 2.25,
      bonus: 400,
      hiresCount: 41,
      gradient: "from-blue-600 to-indigo-600",
      isAvailable: false,
      category: "Social Media"
    },
    {
      id: "content-creators-hub",
      name: "Content Creators Hub",
      acronym: "CCH",
      description: "Video and written content creation services",
      hourlyRate: 3.00,
      bonus: 500,
      hiresCount: 19,
      gradient: "from-purple-600 to-pink-600",
      isAvailable: false,
      category: "Content Creation"
    },
    {
      id: "ai-automation-labs",
      name: "AI Automation Labs",
      acronym: "AAL",
      description: "Artificial intelligence solutions for business automation",
      hourlyRate: 5.00,
      bonus: 1000,
      hiresCount: 12,
      gradient: "from-cyan-600 to-blue-600",
      isAvailable: false,
      category: "AI & Automation"
    },
    {
      id: "startup-accelerator",
      name: "Startup Accelerator",
      acronym: "SA",
      description: "Helping early-stage startups scale and grow",
      hourlyRate: 2.50,
      bonus: 600,
      hiresCount: 33,
      gradient: "from-red-600 to-orange-600",
      isAvailable: false,
      category: "Startup Services"
    },
    {
      id: "ecommerce-experts",
      name: "E-commerce Experts",
      acronym: "EE",
      description: "Online store optimization and conversion strategies",
      hourlyRate: 3.25,
      bonus: 550,
      hiresCount: 26,
      gradient: "from-green-600 to-emerald-600",
      isAvailable: false,
      category: "E-commerce"
    },
    {
      id: "blockchain-builders",
      name: "Blockchain Builders",
      acronym: "BB",
      description: "Decentralized applications and crypto solutions",
      hourlyRate: 4.50,
      bonus: 900,
      hiresCount: 8,
      gradient: "from-yellow-600 to-orange-600",
      isAvailable: false,
      category: "Blockchain"
    },
    {
      id: "mobile-app-studio",
      name: "Mobile App Studio",
      acronym: "MAS",
      description: "iOS and Android app development and marketing",
      hourlyRate: 3.75,
      bonus: 650,
      hiresCount: 31,
      gradient: "from-indigo-600 to-purple-600",
      isAvailable: false,
      category: "Mobile Development"
    },
    {
      id: "data-analytics-firm",
      name: "Data Analytics Firm",
      acronym: "DAF",
      description: "Business intelligence and data visualization",
      hourlyRate: 4.25,
      bonus: 700,
      hiresCount: 17,
      gradient: "from-teal-600 to-cyan-600",
      isAvailable: false,
      category: "Data & Analytics"
    },
    {
      id: "influencer-network",
      name: "Influencer Network",
      acronym: "IN",
      description: "Connecting brands with social media influencers",
      hourlyRate: 2.75,
      bonus: 450,
      hiresCount: 45,
      gradient: "from-pink-600 to-purple-600",
      isAvailable: false,
      category: "Influencer Marketing"
    },
    {
      id: "video-production-co",
      name: "Video Production Co",
      acronym: "VPC",
      description: "Professional video content for marketing campaigns",
      hourlyRate: 3.50,
      bonus: 800,
      hiresCount: 23,
      gradient: "from-red-600 to-pink-600",
      isAvailable: false,
      category: "Video Production"
    },
    {
      id: "seo-specialists",
      name: "SEO Specialists",
      acronym: "SS",
      description: "Search engine optimization and organic traffic growth",
      hourlyRate: 2.90,
      bonus: 520,
      hiresCount: 38,
      gradient: "from-green-600 to-blue-600",
      isAvailable: false,
      category: "SEO & SEM"
    },
    {
      id: "ux-design-collective",
      name: "UX Design Collective",
      acronym: "UDC",
      description: "User experience design for web and mobile applications",
      hourlyRate: 4.00,
      bonus: 750,
      hiresCount: 21,
      gradient: "from-orange-600 to-red-600",
      isAvailable: false,
      category: "UX/UI Design"
    },
    {
      id: "cybersecurity-pros",
      name: "Cybersecurity Pros",
      acronym: "CP",
      description: "Information security and threat protection services",
      hourlyRate: 5.50,
      bonus: 1200,
      hiresCount: 9,
      gradient: "from-gray-600 to-gray-800",
      isAvailable: false,
      category: "Cybersecurity"
    },
    {
      id: "cloud-solutions-ltd",
      name: "Cloud Solutions Ltd",
      acronym: "CSL",
      description: "Cloud infrastructure and migration services",
      hourlyRate: 4.75,
      bonus: 850,
      hiresCount: 15,
      gradient: "from-blue-600 to-cyan-600",
      isAvailable: false,
      category: "Cloud Services"
    },
    {
      id: "fintech-innovators",
      name: "FinTech Innovators",
      acronym: "FI",
      description: "Financial technology solutions and payment systems",
      hourlyRate: 4.25,
      bonus: 900,
      hiresCount: 11,
      gradient: "from-emerald-600 to-teal-600",
      isAvailable: false,
      category: "Financial Technology"
    },
    {
      id: "gaming-studios-group",
      name: "Gaming Studios Group",
      acronym: "GSG",
      description: "Mobile and PC game development and marketing",
      hourlyRate: 3.25,
      bonus: 600,
      hiresCount: 29,
      gradient: "from-purple-600 to-indigo-600",
      isAvailable: false,
      category: "Gaming"
    },
    {
      id: "healthtech-solutions",
      name: "HealthTech Solutions",
      acronym: "HTS",
      description: "Digital health platforms and telemedicine",
      hourlyRate: 4.50,
      bonus: 800,
      hiresCount: 13,
      gradient: "from-green-600 to-lime-600",
      isAvailable: false,
      category: "Healthcare Technology"
    }
  ];

  const handleCompanyClick = (company: Company) => {
    if (company.isAvailable) {
      if (company.id === "silicon-valley-consulting") {
        navigate("/companies/silicon-valley-consulting");
      } else {
        navigate(`/companies/${company.id}`);
      }
    } else {
      setShowLockedAlert(true);
      setTimeout(() => setShowLockedAlert(false), 5000);
    }
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
                href="/"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Home
              </a>
            </nav>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Company Marketplace
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Connect with leading companies looking for social media contractors.
              Start with your matched company to build your reputation and unlock more opportunities.
            </p>
            {currency.code !== "USD" && !currencyLoading && (
              <p className="text-sm text-blue-600 mt-4">
                All compensation amounts shown in {currency.code} (converted from USD)
              </p>
            )}
          </div>

          {/* Locked Alert */}
          {showLockedAlert && (
            <Alert className="mb-8 border-orange-200 bg-orange-50">
              <Lock className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Company Locked:</strong> You need to complete your first assignment with Silicon Valley Consulting 
                and receive a positive review before you can work with other companies. This ensures quality and builds your reputation on our platform.
              </AlertDescription>
            </Alert>
          )}

          {/* Companies Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {companies.map((company) => (
              <Card 
                key={company.id}
                className={`
                  relative overflow-hidden transition-all duration-300 cursor-pointer
                  ${company.isAvailable 
                    ? 'hover:shadow-lg hover:scale-105 border-green-200 ring-2 ring-green-500 ring-opacity-20' 
                    : 'hover:shadow-md opacity-75'
                  }
                `}
                onClick={() => handleCompanyClick(company)}
              >
                {!company.isAvailable && (
                  <div className="absolute top-2 right-2 z-10">
                    <Lock className="w-4 h-4 text-gray-500" />
                  </div>
                )}
                
                {company.isAvailable && (
                  <div className="absolute top-0 right-0">
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 rounded-none rounded-bl-lg">
                      ✓ AVAILABLE
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center justify-center mb-4">
                    <div className={`w-16 h-16 bg-gradient-to-r ${company.gradient} rounded-full flex items-center justify-center`}>
                      <span className="text-white font-bold text-lg">{company.acronym}</span>
                    </div>
                  </div>
                  
                  <CardTitle className={`text-center text-lg ${!company.isAvailable ? 'blur-sm' : ''}`}>
                    {company.name}
                  </CardTitle>
                  
                  <CardDescription className={`text-center text-sm ${!company.isAvailable ? 'blur-sm' : ''}`}>
                    {company.category}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className={`space-y-3 ${!company.isAvailable ? 'blur-sm' : ''}`}>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">
                        {currencyLoading
                          ? "$--/hour + $--- bonus"
                          : `${formatCurrency(company.hourlyRate)}/hour + ${formatCurrency(company.bonus)} bonus`}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{company.hiresCount} hires</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span>4.8</span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center line-clamp-2">
                      {company.description}
                    </p>
                  </div>

                  {company.isAvailable && (
                    <div className="mt-4 flex items-center justify-center gap-1 text-blue-600 text-sm font-medium">
                      <span>View Details</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Info Section */}
          <div className="mt-16 bg-blue-50 rounded-lg p-8 border border-blue-200">
            <div className="text-center max-w-4xl mx-auto">
              <AlertTriangle className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-blue-900 mb-4">
                How Our Marketplace Works
              </h3>
              <div className="space-y-4 text-blue-800">
                <p>
                  <strong>Step 1:</strong> Complete your first assignment with Silicon Valley Consulting to establish your reputation and work quality.
                </p>
                <p>
                  <strong>Step 2:</strong> Receive a positive review (4+ stars) from your initial company to unlock additional opportunities.
                </p>
                <p>
                  <strong>Step 3:</strong> Browse and apply to work with multiple companies simultaneously, increasing your earning potential.
                </p>
                <p className="text-sm">
                  This system ensures high-quality contractors and helps companies find reliable talent through proven track records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
